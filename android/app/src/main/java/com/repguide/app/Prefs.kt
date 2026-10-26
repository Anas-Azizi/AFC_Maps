package com.repguide.app

import android.content.Context

object Prefs {
    private const val NAME = "rep_guide_prefs"
    private const val KEY_TOKEN = "token"
    private const val KEY_USER_NAME = "user_name"
    private const val KEY_SERVER_URL = "server_url"
    private const val KEY_DATA_VERSION = "data_version"
    private const val KEY_PERMISSIONS = "permissions"
    private const val KEY_PINS_HIDDEN = "pins_hidden"
    private const val KEY_REP_FILTER = "rep_filter"

    private fun sp(ctx: Context) = ctx.getSharedPreferences(NAME, Context.MODE_PRIVATE)

    fun token(ctx: Context): String? = sp(ctx).getString(KEY_TOKEN, null)

    fun userName(ctx: Context): String? = sp(ctx).getString(KEY_USER_NAME, null)

    fun saveSession(ctx: Context, token: String, userName: String) {
        sp(ctx).edit().putString(KEY_TOKEN, token).putString(KEY_USER_NAME, userName).apply()
    }

    fun clearSession(ctx: Context) {
        sp(ctx).edit()
            .remove(KEY_TOKEN)
            .remove(KEY_USER_NAME)
            .remove(KEY_PERMISSIONS)
            .remove(KEY_REP_FILTER)
            .apply()
    }

    /** صلاحيات المستخدم المخزنة — عند غيابها تُطبَّق القيم الافتراضية المتساهلة */
    fun permissions(ctx: Context): Permissions =
        sp(ctx).getString(KEY_PERMISSIONS, null)
            ?.let { runCatching { Permissions.fromJson(org.json.JSONObject(it)) }.getOrNull() }
            ?: Permissions()

    fun setPermissions(ctx: Context, permissions: Permissions) {
        sp(ctx).edit().putString(KEY_PERMISSIONS, permissions.toJson().toString()).apply()
    }

    fun pinsHidden(ctx: Context): Boolean = sp(ctx).getBoolean(KEY_PINS_HIDDEN, false)

    fun setPinsHidden(ctx: Context, hidden: Boolean) {
        sp(ctx).edit().putBoolean(KEY_PINS_HIDDEN, hidden).apply()
    }

    fun repFilter(ctx: Context): String? = sp(ctx).getString(KEY_REP_FILTER, null)

    fun setRepFilter(ctx: Context, rep: String?) {
        val editor = sp(ctx).edit()
        if (rep == null) editor.remove(KEY_REP_FILTER) else editor.putString(KEY_REP_FILTER, rep)
        editor.apply()
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
