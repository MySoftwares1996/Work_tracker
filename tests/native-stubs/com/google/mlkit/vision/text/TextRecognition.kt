// ML Kit text recognition (com.google.mlkit:text-recognition), as far as the OCR call uses it:
// TextRecognition.getClient(options).process(image) -> Task<Text>, Text.textBlocks -> lines.
package com.google.mlkit.vision.text
import android.graphics.Rect
import com.google.android.gms.tasks.Task
import com.google.mlkit.vision.common.InputImage
import java.io.Closeable

interface TextRecognizerOptionsInterface

interface TextRecognizer : Closeable {
  fun process(image: InputImage): Task<Text>
}

class Text {
  val textBlocks: List<TextBlock> = emptyList()
  class TextBlock { val lines: List<Line> = emptyList() }
  class Line { val text: String = ""; val boundingBox: Rect? = null }
}

object TextRecognition {
  @JvmStatic fun getClient(options: TextRecognizerOptionsInterface): TextRecognizer = throw UnsupportedOperationException()
}
