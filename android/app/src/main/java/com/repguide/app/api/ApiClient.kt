package com.repguide.app.api

import com.repguide.app.data.LandmarkEntity
import com.repguide.app.data.RegionEntity
import com.repguide.app.data.StoreEntity
import com.repguide.app.data.VisitEntity
import com.repguide.app.Permissions
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.io.File
import java.util.concurrent.TimeUnit

object ApiClient {
    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .build()

    /** [status] is 401 when re-login is needed; [message] carries the server's Arabic error. */
    class ApiException(val status: Int, message: String) : Exception(message)

    class NetworkException(message: String) : Exception(message)

    data class LoginResult(val token: String, val userName: String, val permissions: Permissions)

    data class Snapshot(
        val version: Int,
        val regions: List<RegionEntity>,
        val stores: List<StoreEntity>,
        val landmarks: List<LandmarkEntity>,
        val visits: List<VisitEntity>
    )

    private fun execute(request: Request, unknownError: String): String {
        val response = try {
            client.newCall(request).execute()
        } catch (e: Exception) {
            throw NetworkException(e.message ?: e.javaClass.simpleName)
        }
        return response.use { resp ->
            val body = resp.body?.string().orEmpty()
            if (resp.isSuccessful) {
                body
            } else {
                val msg = runCatching { JSONObject(body).optString("error") }
                    .getOrDefault("").ifBlank { unknownError }
                throw ApiException(resp.code, msg)
            }
        }
    }

    fun login(serverUrl: String, username: String, password: String, unknownError: String): LoginResult {
        val payload = JSONObject()
            .put("username", username)
            .put("password", password)
            .toString()
            .toRequestBody("application/json; charset=utf-8".toMediaType())
        val request = Request.Builder()
            .url("$serverUrl/api/auth/login")
            .post(payload)
            .build()
        val body = execute(request, unknownError)
        val json = JSONObject(body)
        val user = json.getJSONObject("user")
        return LoginResult(
            token = json.getString("token"),
            userName = user.optString("name"),
            permissions = Permissions.fromJson(user.optJSONObject("permissions"))
        )
    }

    /** يجلب صلاحيات المستخدم الحالي — أفضل جهد، يُستدعى عند فتح التطبيق لتحديث النسخة المخزنة */
    fun fetchMe(serverUrl: String, token: String, unknownError: String): Permissions {
        val request = Request.Builder()
            .url("$serverUrl/api/auth/me")
            .header("Authorization", "Bearer $token")
            .get()
            .build()
        val body = execute(request, unknownError)
        val user = JSONObject(body).optJSONObject("user") ?: JSONObject(body)
        return Permissions.fromJson(user.optJSONObject("permissions"))
    }

    fun submitStore(
        serverUrl: String,
        token: String,
        name: String,
        lat: Double,
        lng: Double,
        unknownError: String
    ) {
        val payload = JSONObject()
            .put("name", name)
            .put("lat", lat)
            .put("lng", lng)
            .toString()
            .toRequestBody("application/json; charset=utf-8".toMediaType())
        val request = Request.Builder()
            .url("$serverUrl/api/data/submissions")
            .header("Authorization", "Bearer $token")
            .post(payload)
            .build()
        execute(request, unknownError)
    }

    fun submitStoreUpdate(
        serverUrl: String,
        token: String,
        storeId: Int?,
        storeName: String,
        lat: Double?,
        lng: Double?,
        note: String?,
        unknownError: String,
        newName: String? = null,
        cancel: Boolean = false
    ) {
        val payload = JSONObject()
            .put("storeName", storeName)
        storeId?.let { payload.put("storeId", it) }
        lat?.let { payload.put("lat", it) }
        lng?.let { payload.put("lng", it) }
        note?.let { payload.put("note", it) }
        newName?.let { payload.put("newName", it) }
        if (cancel) payload.put("cancel", true)
        val request = Request.Builder()
            .url("$serverUrl/api/data/updates")
            .header("Authorization", "Bearer $token")
            .post(payload.toString().toRequestBody("application/json; charset=utf-8".toMediaType()))
            .build()
        execute(request, unknownError)
    }

    fun fetchSnapshot(serverUrl: String, token: String, unknownError: String): Snapshot {
        val request = Request.Builder()
            .url("$serverUrl/api/data/snapshot")
            .header("Authorization", "Bearer $token")
            .get()
            .build()
        val body = execute(request, unknownError)
        val json = JSONObject(body)

        val regionsJson = json.getJSONArray("regions")
        val regions = ArrayList<RegionEntity>(regionsJson.length())
        for (i in 0 until regionsJson.length()) {
            val r = regionsJson.getJSONObject(i)
            regions.add(
                RegionEntity(
                    id = r.getInt("id"),
                    name = r.getString("name"),
                    color = if (r.isNull("color")) null else r.getString("color"),
                    polygonJson = if (r.isNull("polygon")) null else r.getJSONArray("polygon").toString(),
                    labelLat = if (r.isNull("labelLat")) null else r.getDouble("labelLat"),
                    labelLng = if (r.isNull("labelLng")) null else r.getDouble("labelLng")
                )
            )
        }

        val storesJson = json.getJSONArray("stores")
        val stores = ArrayList<StoreEntity>(storesJson.length())
        fun JSONObject.str(key: String): String? = if (isNull(key)) null else getString(key)
        fun JSONObject.dbl(key: String): Double? = if (isNull(key)) null else getDouble(key)
        fun JSONObject.intOrNull(key: String): Int? = if (isNull(key)) null else getInt(key)
        for (i in 0 until storesJson.length()) {
            val s = storesJson.getJSONObject(i)
            stores.add(
                StoreEntity(
                    id = s.getInt("id"),
                    name = s.getString("name"),
                    ownerName = s.str("ownerName"),
                    phone = s.str("phone"),
                    lat = s.dbl("lat"),
                    lng = s.dbl("lng"),
                    regionId = s.intOrNull("regionId"),
                    notes = s.str("notes"),
                    code = s.intOrNull("code"),
                    address = s.str("address"),
                    whatsapp = s.str("whatsapp"),
                    accountType = s.str("accountType"),
                    status = s.str("status"),
                    category = s.str("category"),
                    shopClass = s.str("shopClass"),
                    managerName = s.str("managerName"),
                    governate = s.str("governate")
                )
            )
        }

        val landmarksJson = json.optJSONArray("landmarks")
        val landmarks = ArrayList<LandmarkEntity>(landmarksJson?.length() ?: 0)
        if (landmarksJson != null) {
            for (i in 0 until landmarksJson.length()) {
                val l = landmarksJson.getJSONObject(i)
                landmarks.add(
                    LandmarkEntity(
                        id = l.getInt("id"),
                        name = l.getString("name"),
                        lat = l.getDouble("lat"),
                        lng = l.getDouble("lng")
                    )
                )
            }
        }
        val visitsJson = json.optJSONArray("visits")
        val visits = ArrayList<VisitEntity>(visitsJson?.length() ?: 0)
        if (visitsJson != null) {
            for (i in 0 until visitsJson.length()) {
                val v = visitsJson.getJSONObject(i)
                visits.add(
                    VisitEntity(
                        storeId = v.getInt("storeId"),
                        repName = v.str("repName"),
                        invoiceType = v.str("invoiceType"),
                        visitDay = v.str("visitDay")
                    )
                )
            }
        }
        return Snapshot(json.optInt("version", 0), regions, stores, landmarks, visits)
    }

    data class TilesInfo(
        val available: Boolean,
        val size: Long,
        val bbox: List<Double>?,
        val zooms: List<Int>?
    )

    fun fetchTilesInfo(serverUrl: String, token: String, unknownError: String): TilesInfo {
        val request = Request.Builder()
            .url("$serverUrl/api/tiles/info")
            .header("Authorization", "Bearer $token")
            .get()
            .build()
        val body = execute(request, unknownError)
        val json = JSONObject(body)
        val bbox = if (json.isNull("bbox")) null else {
            val arr = json.getJSONArray("bbox")
            (0 until arr.length()).map { arr.getDouble(it) }
        }
        val zooms = if (json.isNull("zooms")) null else {
            val arr = json.getJSONArray("zooms")
            (0 until arr.length()).map { arr.getInt(it) }
        }
        return TilesInfo(json.optBoolean("available", false), json.optLong("size", 0), bbox, zooms)
    }

    data class Route(
        val distanceMeters: Double,
        val durationSeconds: Double,
        val points: List<DoubleArray> // أزواج [lat, lng]
    )

    fun fetchRoute(
        serverUrl: String,
        token: String,
        fromLat: Double,
        fromLng: Double,
        toLat: Double,
        toLng: Double,
        unknownError: String
    ): Route {
        val request = Request.Builder()
            .url("$serverUrl/api/route?from=$fromLng,$fromLat&to=$toLng,$toLat")
            .header("Authorization", "Bearer $token")
            .get()
            .build()
        val body = execute(request, unknownError)
        val json = JSONObject(body)
        val arr = json.getJSONArray("points")
        val points = ArrayList<DoubleArray>(arr.length())
        for (i in 0 until arr.length()) {
            val p = arr.getJSONArray(i)
            points.add(doubleArrayOf(p.getDouble(1), p.getDouble(0))) // OSM GeoJSON = [lng, lat]
        }
        return Route(json.getDouble("distance"), json.getDouble("duration"), points)
    }

    /** يُستدعى من خيط خلفي؛ [onProgress] تُستدعى بنسبة 0..100 عند معرفة الحجم الكلي. */
    fun downloadTilesPackage(
        serverUrl: String,
        token: String,
        dest: File,
        unknownError: String,
        onProgress: (Int) -> Unit
    ) {
        val request = Request.Builder()
            .url("$serverUrl/api/tiles/package")
            .header("Authorization", "Bearer $token")
            .get()
            .build()
        val response = try {
            client.newCall(request).execute()
        } catch (e: Exception) {
            throw NetworkException(e.message ?: e.javaClass.simpleName)
        }
        response.use { resp ->
            if (!resp.isSuccessful) {
                val errBody = resp.body?.string().orEmpty()
                val msg = runCatching { JSONObject(errBody).optString("error") }
                    .getOrDefault("").ifBlank { unknownError }
                throw ApiException(resp.code, msg)
            }
            val body = resp.body ?: throw NetworkException("empty body")
            val total = body.contentLength()
            dest.parentFile?.mkdirs()
            body.byteStream().use { input ->
                dest.outputStream().use { output ->
                    val buffer = ByteArray(64 * 1024)
                    var downloaded = 0L
                    while (true) {
                        val read = input.read(buffer)
                        if (read == -1) break
                        output.write(buffer, 0, read)
                        downloaded += read
                        if (total > 0) onProgress(((downloaded * 100) / total).toInt())
                    }
                }
            }
        }
    }
}
