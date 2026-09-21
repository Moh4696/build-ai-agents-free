package com.sixninezerozero.freeagent

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
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
        setContent {
            FreeAgentTheme {
                FreeAgentApp(viewModel = viewModel)
            }
        }
    }
}
