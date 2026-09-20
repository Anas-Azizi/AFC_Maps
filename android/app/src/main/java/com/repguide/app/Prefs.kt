package com.repguide.app

import android.content.Context

object Prefs {
    private const val NAME = "rep_guide_prefs"
    private const val KEY_TOKEN = "token"
    private const val KEY_USER_NAME = "user_name"
    private const val KEY_SERVER_URL = "server_url"
    private const val KEY_DATA_VERSION = "data_version"

    private fun sp(ctx: Context) = ctx.getSharedPreferences(NAME, Context.MODE_PRIVATE)

    fun token(ctx: Context): String? = sp(ctx).getString(KEY_TOKEN, null)

    fun userName(ctx: Context): String? = sp(ctx).getString(KEY_USER_NAME, null)

    fun saveSession(ctx: Context, token: String, userName: String) {
        sp(ctx).edit().putString(KEY_TOKEN, token).putString(KEY_USER_NAME, userName).apply()
    }

    fun clearSession(ctx: Context) {
        sp(ctx).edit().remove(KEY_TOKEN).remove(KEY_USER_NAME).apply()
    }

    fun serverUrl(ctx: Context): String =
        sp(ctx).getString(KEY_SERVER_URL, null)?.takeIf { it.isNotBlank() }
            ?: BuildConfig.DEFAULT_SERVER_URL

    fun setServerUrl(ctx: Context, url: String) {
        sp(ctx).edit().putString(KEY_SERVER_URL, url.trim().trimEnd('/')).apply()
    }

    fun dataVersion(ctx: Context): Int = sp(ctx).getInt(KEY_DATA_VERSION, 0)

    fun setDataVersion(ctx: Context, version: Int) {
        sp(ctx).edit().putInt(KEY_DATA_VERSION, version).apply()
    }
}
