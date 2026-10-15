// ML Kit's Latin-script recognizer options.
package com.google.mlkit.vision.text.latin
import com.google.mlkit.vision.text.TextRecognizerOptionsInterface

class TextRecognizerOptions private constructor() : TextRecognizerOptionsInterface {
  companion object {
    @JvmField val DEFAULT_OPTIONS: TextRecognizerOptions = TextRecognizerOptions()
  }
}
