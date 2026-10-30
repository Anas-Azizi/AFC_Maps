package com.repguide.app

import org.json.JSONArray
import org.json.JSONObject

/**
 * صلاحيات المستخدم القادمة من الخادم (login /auth/me).
 * كل الحقول اختيارية — غياب الحقل يعني السماح (سلوك متساهل مع الخوادم القديمة).
 */
data class Permissions(
    val reps: List<String>? = null,
    val canFilterByRep: Boolean = true,
    val showPhone: Boolean = true,
    val showWhatsapp: Boolean = true,
    val showVisits: Boolean = true,
    val showCategory: Boolean = true,
    val showShopClass: Boolean = true,
    val showGovernate: Boolean = true,
    val showAddress: Boolean = true,
    val canAddNote: Boolean = true,
    val canDrawRoute: Boolean = true,
    val canShareLocation: Boolean = true,
    val canUpdateLocation: Boolean = true,
    val canUpdateBoth: Boolean = true,
    val canRename: Boolean = true,
    val canAddStore: Boolean = true,
    val showServerAddress: Boolean = true,
    val canDownloadMaps: Boolean = true,
    val forceRealGps: Boolean = true
) {
    fun toJson(): JSONObject {
        val json = JSONObject()
        if (reps == null) {
            json.put("reps", JSONObject.NULL)
        } else {
            json.put("reps", JSONArray(reps))
        }
        json.put("canFilterByRep", canFilterByRep)
        json.put("showPhone", showPhone)
        json.put("showWhatsapp", showWhatsapp)
        json.put("showVisits", showVisits)
        json.put("showCategory", showCategory)
        json.put("showShopClass", showShopClass)
        json.put("showGovernate", showGovernate)
        json.put("showAddress", showAddress)
        json.put("canAddNote", canAddNote)
        json.put("canDrawRoute", canDrawRoute)
        json.put("canShareLocation", canShareLocation)
        json.put("canUpdateLocation", canUpdateLocation)
        json.put("canUpdateBoth", canUpdateBoth)
        json.put("canRename", canRename)
        json.put("canAddStore", canAddStore)
        json.put("showServerAddress", showServerAddress)
        json.put("canDownloadMaps", canDownloadMaps)
        json.put("forceRealGps", forceRealGps)
        return json
    }

    companion object {
        fun fromJson(json: JSONObject?): Permissions {
            if (json == null) return Permissions()
            val reps = if (json.isNull("reps")) null else {
                val arr = json.optJSONArray("reps") ?: return@fromJson Permissions()
                (0 until arr.length()).map { arr.getString(it) }
            }
            return Permissions(
                reps = reps,
                canFilterByRep = json.optBoolean("canFilterByRep", true),
                showPhone = json.optBoolean("showPhone", true),
                showWhatsapp = json.optBoolean("showWhatsapp", true),
                showVisits = json.optBoolean("showVisits", true),
                showCategory = json.optBoolean("showCategory", true),
                showShopClass = json.optBoolean("showShopClass", true),
                showGovernate = json.optBoolean("showGovernate", true),
                showAddress = json.optBoolean("showAddress", true),
                canAddNote = json.optBoolean("canAddNote", true),
                canDrawRoute = json.optBoolean("canDrawRoute", true),
                canShareLocation = json.optBoolean("canShareLocation", true),
                canUpdateLocation = json.optBoolean("canUpdateLocation", true),
                canUpdateBoth = json.optBoolean("canUpdateBoth", true),
                canRename = json.optBoolean("canRename", true),
                canAddStore = json.optBoolean("canAddStore", true),
                showServerAddress = json.optBoolean("showServerAddress", true),
                canDownloadMaps = json.optBoolean("canDownloadMaps", true),
                forceRealGps = json.optBoolean("forceRealGps", true)
            )
        }
    }
}
