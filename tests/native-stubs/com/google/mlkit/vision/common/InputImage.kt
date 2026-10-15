// ML Kit's InputImage, as far as the OCR call uses it.
package com.google.mlkit.vision.common
import android.graphics.Bitmap

class InputImage private constructor() {
  companion object {
    @JvmStatic fun fromBitmap(bitmap: Bitmap, rotationDegrees: Int): InputImage = InputImage()
  }
}
