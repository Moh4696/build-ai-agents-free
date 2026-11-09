package com.sixninezerozero.freeagent

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import com.sixninezerozero.freeagent.data.VideoMaker
import com.sixninezerozero.freeagent.ui.FreeAgentApp
import com.sixninezerozero.freeagent.ui.FreeAgentViewModel
import com.sixninezerozero.freeagent.ui.theme.FreeAgentTheme

class MainActivity : ComponentActivity() {
    private val viewModel: FreeAgentViewModel by viewModels {
        FreeAgentViewModel.factory(applicationContext)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        // The video engine runs in a tiny WebView that needs a window to render at full speed.
        VideoMaker.get(this).attachHost(findViewById(android.R.id.content))
        setContent {
            FreeAgentTheme {
                FreeAgentApp(viewModel = viewModel)
            }
        }
    }

    override fun onDestroy() {
        VideoMaker.get(this).detachHost(findViewById(android.R.id.content))
        super.onDestroy()
    }
}
