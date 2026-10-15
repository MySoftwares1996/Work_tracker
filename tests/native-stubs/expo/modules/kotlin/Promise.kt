// Signatures copied from expo-modules-core 57.0.18 Promise.kt
package expo.modules.kotlin
interface Promise {
  fun resolve(value: Any?)
  fun resolve() = resolve(null)
  fun resolve(result: Int) = resolve(result as Any?)
  fun resolve(result: Boolean) = resolve(result as Any?)
  fun resolve(result: Double) = resolve(result as Any?)
  fun resolve(result: Float) = resolve(result as Any?)
  fun resolve(result: String) = resolve(result as Any?)
  fun resolve(result: Collection<Any?>) = resolve(result as Any?)
  fun resolve(result: Map<String, Any?>) = resolve(result as Any?)
  fun reject(code: String?, message: String?, cause: Throwable?)
}
