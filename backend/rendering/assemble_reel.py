#!/usr/bin/env python3
"""
assemble_reel.py — Turn scene PNGs (+ optional voiceover) into a final vertical MP4.

Modes:
  Fixed timing:   --durs 7,9,9,4,6,...   (one number per scene, seconds)
  Sync-to-VO:     --vo voice.wav         (cuts auto-timed to narration pauses)

Examples:
  python assemble_reel.py --scenes ./scenes --out reel.mp4 --durs 5,6,6,4
  python assemble_reel.py --scenes ./scenes --out reel.mp4 --vo vo.wav --tail 6,5

Requires: ffmpeg, ffprobe.
"""
import os, sys, glob, json, subprocess, argparse, wave, contextlib

def run(cmd, **kw):
    r = subprocess.run(cmd, shell=True, capture_output=True, text=True, **kw)
    if r.returncode != 0:
        sys.stderr.write(f"ERR: {cmd}\n{r.stderr[-800:]}\n")
        raise SystemExit(1)
    return r

def dur_of(path):
    r = run(f'ffprobe -loglevel error -show_entries format=duration -of default=nw=1:nk=1 "{path}"')
    return float(r.stdout.strip())

def detect_pauses(vo, noise="-34dB", mind=0.18):
    """Return pause-center timestamps (seconds) in the VO."""
    r = run(f'ffmpeg -hide_banner -i "{vo}" -af "silencedetect=noise={noise}:d={mind}" -f null /dev/null 2>&1', )
    # silencedetect prints to stderr; subprocess merged via 2>&1 in shell
    out = r.stdout + r.stderr
    starts, ends = [], []
    for line in out.splitlines():
        if "silence_start:" in line:
            starts.append(float(line.split("silence_start:")[1].strip().split()[0]))
        elif "silence_end:" in line:
            seg = line.split("silence_end:")[1].strip()
            ends.append(float(seg.split("|")[0].strip()))
    centers = []
    for s, e in zip(starts, ends):
        centers.append(round((s + e) / 2, 2))
    return centers

def plan_durations_from_vo(vo, n_scenes, tail):
    """Distribute scene cuts across VO pause centers; remaining scenes get `tail` durations."""
    vlen = dur_of(vo)
    centers = detect_pauses(vo)
    n_tail = len(tail)
    n_vo = n_scenes - n_tail
    if n_vo < 1:
        raise SystemExit("More tail durations than scenes.")
    # We need n_vo segment boundaries within [0, vlen]. Pick evenly from detected centers.
    if len(centers) >= n_vo - 1 and n_vo > 1:
        # choose n_vo-1 boundaries spread across the available centers
        idx = [round(i * (len(centers) - 1) / (n_vo - 1)) for i in range(n_vo - 1)]
        bounds = [centers[i] for i in sorted(set(idx))]
    else:
        # fallback: even split
        bounds = [vlen * (i + 1) / n_vo for i in range(n_vo - 1)]
    segs = [0.0] + bounds + [vlen]
    vo_durs = [round(segs[i + 1] - segs[i], 2) for i in range(len(segs) - 1)]
    # guard against any scene < 1.2s
    vo_durs = [max(1.2, d) for d in vo_durs]
    return vo_durs + list(tail), vlen

def render_segments(pngs, durs, workdir, fps=30):
    segdir = os.path.join(workdir, "segments")
    os.makedirs(segdir, exist_ok=True)
    seg_paths = []
    for i, (png, d) in enumerate(zip(pngs, durs), 1):
        seg = os.path.join(segdir, f"seg{i:02d}.mp4")
        run(f'ffmpeg -y -loglevel error -loop 1 -t {d} -framerate {fps} -i "{png}" '
            f'-c:v libx264 -preset ultrafast -tune stillimage -crf 22 -pix_fmt yuv420p '
            f'-r {fps} -an "{seg}"')
        seg_paths.append(seg)
    return seg_paths

def concat_segments(seg_paths, workdir):
    lst = os.path.join(workdir, "concat.txt")
    with open(lst, "w") as f:
        for s in seg_paths:
            f.write(f"file '{os.path.abspath(s)}'\n")
    out = os.path.join(workdir, "video_silent.mp4")
    run(f'ffmpeg -y -loglevel error -f concat -safe 0 -i "{lst}" -c:v copy "{out}"')
    return out

def make_bed(vlen, workdir, freqs=(55, 82.4, 110), gain=0.22):
    bed = os.path.join(workdir, "bed.wav")
    inputs = " ".join(f'-f lavfi -i "sine=frequency={fr}:duration={vlen}"' for fr in freqs)
    vols = ";".join(f"[{i}]volume={v}[a{i}]" for i, v in enumerate([0.13, 0.07, 0.04][:len(freqs)]))
    mix = "".join(f"[a{i}]" for i in range(len(freqs)))
    fade_out = max(0, vlen - 2)
    run(f'ffmpeg -y -loglevel error {inputs} '
        f'-filter_complex "{vols};{mix}amix=inputs={len(freqs)}:duration=longest:normalize=0,'
        f'volume={gain},afade=t=in:st=0:d=1.2,afade=t=out:st={fade_out}:d=2" '
        f'-c:a pcm_s16le -ar 44100 -ac 2 "{bed}"')
    return bed

def mux(video, audio, out, vlen):
    run(f'ffmpeg -y -loglevel error -i "{video}" -i "{audio}" '
        f'-c:v copy -c:a aac -b:a 160k -shortest -movflags +faststart "{out}"')

def build_audio(vo, bed, vlen, workdir):
    """Mix VO (lead) over bed (ducked under VO via sidechain). If no VO, just bed."""
    out = os.path.join(workdir, "audio.m4a")
    if vo:
        vp = os.path.join(workdir, "vo_padded.wav")
        run(f'ffmpeg -y -loglevel error -i "{vo}" '
            f'-af "adelay=150|150,apad,atrim=0:{vlen},aformat=channel_layouts=stereo" -ar 44100 "{vp}"')
        run(f'ffmpeg -y -loglevel error -i "{vp}" -i "{bed}" '
            f'-filter_complex "[1][0]sidechaincompress=threshold=0.05:ratio=4:attack=20:release=400[bd];'
            f'[0][bd]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.95,aresample=44100" '
            f'-c:a aac -b:a 160k -ar 44100 -ac 2 "{out}"')
    else:
        run(f'ffmpeg -y -loglevel error -i "{bed}" -c:a aac -b:a 160k "{out}"')
    return out

def main():
    ap = argparse.ArgumentParser(description="Assemble typographic Reel MP4.")
    ap.add_argument("--scenes", required=True, help="dir of sNN.png scene files")
    ap.add_argument("--out", required=True, help="output mp4 path")
    ap.add_argument("--durs", help="comma list of per-scene seconds (fixed timing)")
    ap.add_argument("--vo", help="voiceover wav -> sync cuts to narration")
    ap.add_argument("--tail", default="6,5", help="seconds for scenes AFTER vo coverage (sync mode)")
    ap.add_argument("--no-bed", action="store_true", help="omit ambient drone bed")
    ap.add_argument("--workdir", default="/tmp/reel_work")
    ap.add_argument("--fps", type=int, default=30)
    args = ap.parse_args()

    os.makedirs(args.workdir, exist_ok=True)
    pngs = sorted(glob.glob(os.path.join(args.scenes, "s*.png")))
    if not pngs:
        raise SystemExit(f"No scene PNGs in {args.scenes}")
    n = len(pngs)

    if args.vo:
        tail = [float(x) for x in args.tail.split(",")] if args.tail else []
        durs, vlen = plan_durations_from_vo(args.vo, n, tail)
    elif args.durs:
        durs = [float(x) for x in args.durs.split(",")]
        if len(durs) != n:
            raise SystemExit(f"{len(durs)} durs for {n} scenes")
        vlen = sum(durs)
    else:
        durs = [4.0] * n
        vlen = sum(durs)

    print(f"Scenes: {n} | durations: {durs} | total {round(sum(durs),2)}s")
    segs = render_segments(pngs, durs, args.workdir, args.fps)
    video = concat_segments(segs, args.workdir)
    vlen = dur_of(video)

    if args.no_bed and not args.vo:
        run(f'cp "{video}" "{args.out}"')
    else:
        bed = make_bed(vlen, args.workdir) if not args.no_bed else None
        if bed is None and args.vo:
            # VO only, silent bed
            bed = os.path.join(args.workdir, "silent.wav")
            run(f'ffmpeg -y -loglevel error -f lavfi -i anullsrc=r=44100:cl=stereo -t {vlen} "{bed}"')
        audio = build_audio(args.vo, bed, vlen, args.workdir)
        mux(video, audio, args.out, vlen)

    print(f"OK -> {args.out}  ({round(dur_of(args.out),2)}s)")

if __name__ == "__main__":
    main()
