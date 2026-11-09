# The app uses no reflection-based JSON or dependency injection frameworks.
# Keep source and line information so release crash reports remain actionable.
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# Methods the video bridge page calls from JavaScript.
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
