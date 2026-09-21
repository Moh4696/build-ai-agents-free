package com.sixninezerozero.freeagent.data

import android.annotation.SuppressLint
import android.content.Context
import android.content.SharedPreferences
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

private const val KEYSTORE_PROVIDER = "AndroidKeyStore"
private const val MASTER_KEY_ALIAS = "free_ai_agent_master_key_v1"
private const val PREFERENCES_NAME = "free_ai_agent_secure_store"
private const val CIPHER_TRANSFORMATION = "AES/GCM/NoPadding"
private const val GCM_TAG_LENGTH_BITS = 128
private const val IV_LENGTH_BYTES = 12

// commit() is deliberate: every call runs on Dispatchers.IO and reports durable-write failures.
@SuppressLint("UseKtx")
class SecureStore(context: Context) {
    private val preferences: SharedPreferences =
        context.applicationContext.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)

    fun putString(key: String, value: String) {
        val encrypted = encrypt(value)
        check(preferences.edit().putString(key, encrypted).commit()) {
            "Could not persist secure app data."
        }
    }

    fun getString(key: String): String? {
        val encrypted = preferences.getString(key, null) ?: return null
        return runCatching { decrypt(encrypted) }
            .onFailure { preferences.edit().remove(key).commit() }
            .getOrNull()
    }

    fun putBoolean(key: String, value: Boolean) {
        check(preferences.edit().putBoolean(key, value).commit()) {
            "Could not persist app settings."
        }
    }

    fun getBoolean(key: String, defaultValue: Boolean): Boolean =
        preferences.getBoolean(key, defaultValue)

    fun remove(key: String) {
        check(preferences.edit().remove(key).commit()) {
            "Could not remove secure app data."
        }
    }

    fun clear() {
        check(preferences.edit().clear().commit()) {
            "Could not erase app data."
        }
    }

    private fun encrypt(plainText: String): String {
        val cipher = Cipher.getInstance(CIPHER_TRANSFORMATION)
        val iv = ByteArray(IV_LENGTH_BYTES).also(SecureRandom()::nextBytes)
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateSecretKey(), GCMParameterSpec(GCM_TAG_LENGTH_BITS, iv))
        val ciphertext = cipher.doFinal(plainText.toByteArray(Charsets.UTF_8))
        return "${iv.toBase64()}.${ciphertext.toBase64()}"
    }

    private fun decrypt(payload: String): String {
        val pieces = payload.split('.', limit = 2)
        require(pieces.size == 2) { "Encrypted value has an invalid format." }
        val iv = pieces[0].fromBase64()
        require(iv.size == IV_LENGTH_BYTES) { "Encrypted value has an invalid IV." }
        val ciphertext = pieces[1].fromBase64()

        val cipher = Cipher.getInstance(CIPHER_TRANSFORMATION)
        cipher.init(Cipher.DECRYPT_MODE, getOrCreateSecretKey(), GCMParameterSpec(GCM_TAG_LENGTH_BITS, iv))
        return cipher.doFinal(ciphertext).toString(Charsets.UTF_8)
    }

    private fun getOrCreateSecretKey(): SecretKey {
        val keyStore = KeyStore.getInstance(KEYSTORE_PROVIDER).apply { load(null) }
        (keyStore.getKey(MASTER_KEY_ALIAS, null) as? SecretKey)?.let { return it }

        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE_PROVIDER).run {
            init(
                KeyGenParameterSpec.Builder(
                    MASTER_KEY_ALIAS,
                    KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
                )
                    .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                    .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                    .setKeySize(256)
                    .setRandomizedEncryptionRequired(true)
                    .build(),
            )
            generateKey()
        }
    }

    private fun ByteArray.toBase64(): String = Base64.encodeToString(this, Base64.NO_WRAP)

    private fun String.fromBase64(): ByteArray = Base64.decode(this, Base64.NO_WRAP)
}
