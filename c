package com.haik.gyminspire

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface

class MainActivity : ComponentActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    setContent {
      Surface(color = MaterialTheme.colorScheme.background) {
        InspireApp()
      }
    }
  }
}
package com.haik.gyminspire

import androidx.compose.runtime.Composable

@Composable
fun InspireApp() {
  InspireScreen()
}
package com.haik.gyminspire

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext
import com.haik.gyminspire.data.Store
import com.haik.gyminspire.logic.*
import kotlinx.coroutines.flow.first

class MainActivity : ComponentActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    setContent {
      val ctx = LocalContext.current
      val store = remember { Store(ctx) }

      LaunchedEffect(Unit) {
        val lastDate = store.lastDoneDateFlow.first()
        val today = todayStr()

        // If streak is broken, just reset the streak value (don’t call setDone)
        if (lastDate != null && !isSameDay(lastDate, today) && !isYesterday(lastDate, today)) {
          store.setStreakOnly(0) // we’ll add this method below
        }

        if (!isSameDay(lastDate, today)) {
          store.setTrigger(randomTrigger())
        }
      }

      Surface(color = MaterialTheme.colorScheme.background) {
        InspireScreen()
      }
    }
  }
}
suspend fun setStreakOnly(value: Int) {
  ctx.dataStore.edit {
    it[Keys.streak] = value
  }
}
