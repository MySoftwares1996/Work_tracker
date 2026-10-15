package com.google.android.gms.tasks

import java.util.concurrent.TimeUnit

// Compile-only stand-in (see tests/native-stubs): the signature WebPresence.kt uses.
object Tasks {
  @JvmStatic fun <T> await(task: Task<T>, timeout: Long, unit: TimeUnit): T = throw UnsupportedOperationException()
}
