package com.kibbisave.app

import android.app.Application
import java.util.concurrent.Executors

class NativeApplication : Application() {
    // Survives Activity recreation. Serial requests avoid overlapping sign-in/sign-out and writes.
    val executor = Executors.newSingleThreadExecutor()
    val imageExecutor = Executors.newFixedThreadPool(2)
    val store by lazy { SecureStore(this) }
    val repository by lazy {
        val legacyTls =
            if (android.os.Build.VERSION.SDK_INT <= 25)
                resources.openRawResource(R.raw.isrg_root_x1).use { WebsiteTls.factory(it) }
            else null
        Repository(store, legacyTls)
    }
}
