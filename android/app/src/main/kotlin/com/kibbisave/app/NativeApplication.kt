package com.kibbisave.app

import android.app.Application
import java.util.concurrent.Executors

class NativeApplication : Application() {
    // Survives Activity recreation. Serial requests avoid overlapping sign-in/sign-out and writes.
    val executor = Executors.newSingleThreadExecutor()
    val store by lazy { SecureStore(this) }
    val repository by lazy { Repository(store) }
}
