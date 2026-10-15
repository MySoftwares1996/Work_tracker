// The slice of play-services-tasks the OCR call uses (Task<TResult> with its success/failure listeners).
package com.google.android.gms.tasks

fun interface OnSuccessListener<TResult> { fun onSuccess(result: TResult) }
fun interface OnFailureListener { fun onFailure(e: Exception) }

abstract class Task<TResult> {
  abstract fun addOnSuccessListener(listener: OnSuccessListener<in TResult>): Task<TResult>
  abstract fun addOnFailureListener(listener: OnFailureListener): Task<TResult>
}
