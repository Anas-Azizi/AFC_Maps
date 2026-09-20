package com.repguide.app.api

import com.repguide.app.data.RegionEntity
import com.repguide.app.data.StoreEntity
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

    data class LoginResult(val token: String, val userName: String)

    data class Snapshot(
        val version: Int,
        val regions: List<RegionEntity>,
        val stores: List<StoreEntity>
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
        return LoginResult(
            token = json.getString("token"),
            userName = json.getJSONObject("user").optString("name")
        )
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
        for (i in 0 until storesJson.length()) {
            val s = storesJson.getJSONObject(i)
            stores.add(
                StoreEntity(
                    id = s.getInt("id"),
                    name = s.getString("name"),
                    ownerName = if (s.isNull("ownerName")) null else s.getString("ownerName"),
                    phone = if (s.isNull("phone")) null else s.getString("phone"),
                    lat = s.getDouble("lat"),
                    lng = s.getDouble("lng"),
                    regionId = if (s.isNull("regionId")) null else s.getInt("regionId"),
                    notes = if (s.isNull("notes")) null else s.getString("notes")
                )
            )
        }
        return Snapshot(json.optInt("version", 0), regions, stores)
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
