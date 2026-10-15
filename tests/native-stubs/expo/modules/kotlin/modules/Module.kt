// Shape copied from expo-modules-core 57.0.18 Module.kt / ObjectDefinitionBuilder.kt.
// The AsyncFunction overload set is reproduced exactly (names, reified generics,
// crossinline bodies, @JvmName), because overload resolution and lambda
// return-type inference against THIS set is what decides whether my code compiles.
package expo.modules.kotlin.modules
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.Promise

class ModuleDefinitionData
class AsyncFunctionComponent

abstract class Module {
  val appContext: AppContext = AppContext()
  abstract fun definition(): ModuleDefinitionData
}

class ModuleDefinitionBuilder {
  fun Name(name: String) {}

  @JvmName("AsyncFunctionWithoutArgs")
  inline fun AsyncFunction(name: String, crossinline body: () -> Any?): AsyncFunctionComponent { return AsyncFunctionComponent() }
  inline fun <reified R> AsyncFunction(name: String, crossinline body: () -> R): AsyncFunctionComponent { return AsyncFunctionComponent() }
  inline fun <reified R, reified P0> AsyncFunction(name: String, crossinline body: (p0: P0) -> R): AsyncFunctionComponent { return AsyncFunctionComponent() }
  inline fun <reified R, reified P0, reified P1> AsyncFunction(name: String, crossinline body: (p0: P0, p1: P1) -> R): AsyncFunctionComponent { return AsyncFunctionComponent() }
  @JvmName("AsyncFunctionWithPromise")
  inline fun <reified R, reified P0> AsyncFunction(name: String, crossinline body: (p0: P0, p1: Promise) -> R): AsyncFunctionComponent { return AsyncFunctionComponent() }
  inline fun <reified R, reified P0, reified P1, reified P2> AsyncFunction(name: String, crossinline body: (p0: P0, p1: P1, p2: P2) -> R): AsyncFunctionComponent { return AsyncFunctionComponent() }
  @JvmName("AsyncFunctionWithPromise")
  inline fun <reified R, reified P0, reified P1> AsyncFunction(name: String, crossinline body: (p0: P0, p1: P1, p2: Promise) -> R): AsyncFunctionComponent { return AsyncFunctionComponent() }
  inline fun <reified R, reified P0, reified P1, reified P2, reified P3> AsyncFunction(name: String, crossinline body: (p0: P0, p1: P1, p2: P2, p3: P3) -> R): AsyncFunctionComponent { return AsyncFunctionComponent() }
  @JvmName("AsyncFunctionWithPromise")
  inline fun <reified R, reified P0, reified P1, reified P2> AsyncFunction(name: String, crossinline body: (p0: P0, p1: P1, p2: P2, p3: Promise) -> R): AsyncFunctionComponent { return AsyncFunctionComponent() }
  inline fun <reified R, reified P0, reified P1, reified P2, reified P3, reified P4> AsyncFunction(name: String, crossinline body: (p0: P0, p1: P1, p2: P2, p3: P3, p4: P4) -> R): AsyncFunctionComponent { return AsyncFunctionComponent() }
  @JvmName("AsyncFunctionWithPromise")
  inline fun <reified R, reified P0, reified P1, reified P2, reified P3> AsyncFunction(name: String, crossinline body: (p0: P0, p1: P1, p2: P2, p3: P3, p4: Promise) -> R): AsyncFunctionComponent { return AsyncFunctionComponent() }
}

inline fun Module.ModuleDefinition(crossinline block: ModuleDefinitionBuilder.() -> Unit): ModuleDefinitionData {
  ModuleDefinitionBuilder().block()
  return ModuleDefinitionData()
}
