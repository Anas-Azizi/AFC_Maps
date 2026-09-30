package com.repguide.app

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.repguide.app.api.ApiClient
import com.repguide.app.data.AppDatabase
import com.repguide.app.data.PendingSubmissionEntity
import com.repguide.app.data.RegionEntity
import com.repguide.app.data.StoreEntity
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class MainViewModel(app: Application) : AndroidViewModel(app) {

    sealed interface Event {
        data class Message(val text: String) : Event
        data object Unauthorized : Event
    }

    data class UiState(
        val regions: List<RegionEntity> = emptyList(),
        val stores: List<StoreEntity> = emptyList(),
        val syncing: Boolean = false,
        val event: Event? = null
    )

    private val dao = AppDatabase.get(app).dataDao()

    private val _state = MutableStateFlow(UiState())
    val state: StateFlow<UiState> = _state

    fun loadLocal(syncIfEmpty: Boolean = true) {
        viewModelScope.launch {
            val (regions, stores) = withContext(Dispatchers.IO) {
                dao.allRegions() to dao.allStores()
            }
            _state.update { it.copy(regions = regions, stores = stores) }
            if (syncIfEmpty && stores.isEmpty()) sync()
        }
    }

    fun sync() {
        val ctx = getApplication<Application>()
        if (_state.value.syncing) return
        viewModelScope.launch {
            _state.update { it.copy(syncing = true) }
            try {
                val token = Prefs.token(ctx) ?: throw ApiClient.ApiException(401, "")
                withContext(Dispatchers.IO) { flushPendingSubmissions(ctx, token) }
                val snapshot = withContext(Dispatchers.IO) {
                    ApiClient.fetchSnapshot(
                        Prefs.serverUrl(ctx),
                        token,
                        ctx.getString(R.string.error_unknown)
                    )
                }
                withContext(Dispatchers.IO) {
                    dao.replaceAll(snapshot.regions, snapshot.stores)
                    Prefs.setDataVersion(ctx, snapshot.version)
                }
                _state.update {
                    it.copy(
                        regions = snapshot.regions,
                        stores = snapshot.stores,
                        event = Event.Message(
                            ctx.getString(R.string.sync_success, snapshot.version)
                        )
                    )
                }
            } catch (e: ApiClient.ApiException) {
                if (e.status == 401) {
                    _state.update { it.copy(event = Event.Unauthorized) }
                } else {
                    _state.update {
                        it.copy(
                            event = Event.Message(
                                ctx.getString(R.string.sync_failed, e.message ?: "")
                            )
                        )
                    }
                }
            } catch (e: ApiClient.NetworkException) {
                _state.update {
                    it.copy(event = Event.Message(ctx.getString(R.string.error_network)))
                }
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        event = Event.Message(
                            ctx.getString(R.string.sync_failed, e.message ?: "")
                        )
                    )
                }
            } finally {
                _state.update { it.copy(syncing = false) }
            }
        }
    }

    fun consumeEvent() {
        _state.update { it.copy(event = null) }
    }

    /** تسجيل محل جديد ميدانياً: إرسال فوري، أو حفظ محلي عند غياب الاتصال */
    fun submitStore(name: String, lat: Double, lng: Double) {
        val ctx = getApplication<Application>()
        viewModelScope.launch {
            val entity = PendingSubmissionEntity(
                name = name, lat = lat, lng = lng, createdAt = System.currentTimeMillis()
            )
            val token = Prefs.token(ctx)
            var queued = false
            if (token != null) {
                try {
                    withContext(Dispatchers.IO) {
                        ApiClient.submitStore(
                            Prefs.serverUrl(ctx), token, name, lat, lng,
                            ctx.getString(R.string.error_unknown)
                        )
                    }
                } catch (e: ApiClient.ApiException) {
                    if (e.status == 401) {
                        _state.update { it.copy(event = Event.Unauthorized) }
                        return@launch
                    }
                    queued = true
                } catch (e: Exception) {
                    queued = true
                }
            } else {
                queued = true
            }
            if (queued) {
                withContext(Dispatchers.IO) { dao.insertPendingSubmission(entity) }
            }
            _state.update {
                it.copy(
                    event = Event.Message(
                        ctx.getString(if (queued) R.string.new_store_queued else R.string.new_store_sent)
                    )
                )
            }
        }
    }

    /** إرسال المحلات المعلّقة المحفوظة محلياً — تُستدعى ضمن المزامنة */
    private suspend fun flushPendingSubmissions(ctx: Application, token: String) {
        for (p in dao.pendingSubmissions()) {
            try {
                ApiClient.submitStore(
                    Prefs.serverUrl(ctx), token, p.name, p.lat, p.lng,
                    ctx.getString(R.string.error_unknown)
                )
                dao.deletePendingSubmission(p.id)
            } catch (e: ApiClient.ApiException) {
                if (e.status == 401) throw e
                // رفض دائم من الخادم (بيانات غير صالحة) — حذفها لتفادي التكرار اللانهائي
                if (e.status in 400..499) dao.deletePendingSubmission(p.id)
            } catch (e: Exception) {
                // لا اتصال — تبقى معلّقة وتُرسل في المزامنة القادمة
                return
            }
        }
    }

    suspend fun clearAllData() {
        withContext(Dispatchers.IO) { dao.clearAll() }
    }
}
