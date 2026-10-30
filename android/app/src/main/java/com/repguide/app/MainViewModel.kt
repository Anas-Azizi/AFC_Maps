package com.repguide.app

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.repguide.app.api.ApiClient
import com.repguide.app.data.AppDatabase
import com.repguide.app.data.LandmarkEntity
import com.repguide.app.data.PendingSubmissionEntity
import com.repguide.app.data.PendingUpdateEntity
import com.repguide.app.data.PolygonEntity
import com.repguide.app.data.RegionEntity
import com.repguide.app.data.StoreEntity
import com.repguide.app.data.VisitEntity
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
        val polygons: List<PolygonEntity> = emptyList(),
        val stores: List<StoreEntity> = emptyList(),
        val landmarks: List<LandmarkEntity> = emptyList(),
        val syncing: Boolean = false,
        val event: Event? = null,
        /** null = كل المحلات؛ غير ذلك فقط المحلات المطابقة لفلتر المسارات */
        val visibleStoreIds: Set<Int>? = null,
        val repNames: List<String> = emptyList(),
        val visitDays: List<String> = emptyList(),
        /** فلتر المندوبين المختار — null = بلا فلترة */
        val repFilter: List<String>? = null,
        /** فلتر أيام الزيارة المختار — null = بلا فلترة */
        val dayFilter: List<String>? = null
    )

    private val dao = AppDatabase.get(app).dataDao()

    private val _state = MutableStateFlow(UiState())
    val state: StateFlow<UiState> = _state

    fun loadLocal(syncIfEmpty: Boolean = true) {
        viewModelScope.launch {
            val local = withContext(Dispatchers.IO) {
                LocalData(
                    regions = dao.allRegions(),
                    polygons = dao.allPolygons(),
                    stores = dao.allStores(),
                    landmarks = dao.allLandmarks()
                )
            }
            _state.update {
                it.copy(
                    regions = local.regions,
                    polygons = local.polygons,
                    stores = local.stores,
                    landmarks = local.landmarks
                )
            }
            refreshVisibility()
            if (syncIfEmpty && local.stores.isEmpty()) sync()
        }
    }

    private data class LocalData(
        val regions: List<RegionEntity>,
        val polygons: List<PolygonEntity>,
        val stores: List<StoreEntity>,
        val landmarks: List<LandmarkEntity>
    )

    /**
     * المناديب الفعّالون: تقييد الصلاحيات حدّ أقصى دائماً، وفلتر المستخدم
     * يضيّق ضمنه فقط. يعيد null عندما لا يوجد أي تقييد (كل المحلات مرئية).
     */
    private fun effectiveReps(ctx: Application): List<String>? {
        val allowed = Prefs.permissions(ctx).reps?.takeIf { it.isNotEmpty() }
        val selected = Prefs.repFilterMulti(ctx)
        return when {
            allowed != null && selected != null ->
                selected.filter { allowed.contains(it) }.ifEmpty { allowed }
            allowed != null -> allowed
            selected != null -> selected
            else -> null
        }
    }

    /** يعيد حساب المحلات المرئية وقوائم المناديب والأيام من قاعدة البيانات */
    fun refreshVisibility() {
        val ctx = getApplication<Application>()
        viewModelScope.launch {
            // مسح مندوبين اختارهم المستخدم ولم يعودوا ضمن المسموحين
            val allowed = Prefs.permissions(ctx).reps?.takeIf { it.isNotEmpty() }
            val selected = Prefs.repFilterMulti(ctx)
            if (allowed != null && selected != null) {
                val cleaned = selected.filter { allowed.contains(it) }
                if (cleaned.size != selected.size) {
                    Prefs.setRepFilterMulti(ctx, cleaned.ifEmpty { null })
                }
            }
            val reps = effectiveReps(ctx)
            val days = Prefs.dayFilter(ctx)
            val data = withContext(Dispatchers.IO) {
                val byReps = reps?.let { dao.storeIdsForReps(it).toSet() }
                val byDays = days?.let { dao.storeIdsForDays(it).toSet() }
                val ids = when {
                    byReps != null && byDays != null -> byReps intersect byDays
                    else -> byReps ?: byDays
                }
                Triple(ids, dao.allRepNames(), dao.allVisitDays())
            }
            _state.update {
                it.copy(
                    visibleStoreIds = data.first,
                    repNames = data.second,
                    visitDays = data.third,
                    repFilter = Prefs.repFilterMulti(ctx),
                    dayFilter = Prefs.dayFilter(ctx)
                )
            }
        }
    }

    /** حفظ فلتر المسارات (مندوبون وأيام) — null يمسح الفلتر المعني */
    fun setRouteFilters(reps: List<String>?, days: List<String>?) {
        val ctx = getApplication<Application>()
        Prefs.setRepFilterMulti(ctx, reps)
        Prefs.setDayFilter(ctx, days)
        refreshVisibility()
    }

    /** تحديث الصلاحيات من /api/auth/me عند فتح التطبيق — أفضل جهد، ويبقى المخزن عند غياب الاتصال */
    fun refreshPermissions() {
        val ctx = getApplication<Application>()
        val token = Prefs.token(ctx) ?: return
        viewModelScope.launch {
            try {
                val permissions = withContext(Dispatchers.IO) {
                    ApiClient.fetchMe(Prefs.serverUrl(ctx), token, ctx.getString(R.string.error_unknown))
                }
                Prefs.setPermissions(ctx, permissions)
                refreshVisibility()
            } catch (e: Exception) {
                // دون اتصال أو خطأ — نبقي الصلاحيات المخزنة
            }
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
                    dao.replaceAll(
                        snapshot.regions, snapshot.polygons,
                        snapshot.stores, snapshot.landmarks, snapshot.visits
                    )
                    Prefs.setDataVersion(ctx, snapshot.version)
                }
                _state.update {
                    it.copy(
                        regions = snapshot.regions,
                        polygons = snapshot.polygons,
                        stores = snapshot.stores,
                        landmarks = snapshot.landmarks,
                        event = Event.Message(
                            ctx.getString(R.string.sync_success, snapshot.version)
                        )
                    )
                }
                refreshVisibility()
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
                            ctx.getString(R.string.error_unknown), entity.createdAt
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

    /** إرسال المحلات والتحديثات المعلّقة المحفوظة محلياً — تُستدعى ضمن المزامنة */
    private suspend fun flushPendingSubmissions(ctx: Application, token: String) {
        for (p in dao.pendingSubmissions()) {
            try {
                ApiClient.submitStore(
                    Prefs.serverUrl(ctx), token, p.name, p.lat, p.lng,
                    ctx.getString(R.string.error_unknown), p.createdAt
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
        for (u in dao.pendingUpdates()) {
            try {
                ApiClient.submitStoreUpdate(
                    Prefs.serverUrl(ctx), token, u.storeId, u.storeName, u.lat, u.lng, u.note,
                    ctx.getString(R.string.error_unknown), u.newName, u.cancel, u.createdAt
                )
                dao.deletePendingUpdate(u.id)
            } catch (e: ApiClient.ApiException) {
                if (e.status == 401) throw e
                if (e.status in 400..499) dao.deletePendingUpdate(u.id)
            } catch (e: Exception) {
                return
            }
        }
    }

    /** تحديث مقترح على محل موجود: موقع جديد، ملاحظة، اسم جديد أو إلغاء نهائي — فوري أو محلي عند غياب الاتصال */
    fun submitStoreUpdate(
        store: StoreEntity,
        lat: Double?,
        lng: Double?,
        note: String?,
        newName: String? = null,
        cancel: Boolean = false
    ) {
        val ctx = getApplication<Application>()
        viewModelScope.launch {
            val entity = PendingUpdateEntity(
                storeId = store.id, storeName = store.name,
                lat = lat, lng = lng, note = note,
                newName = newName, cancel = cancel,
                createdAt = System.currentTimeMillis()
            )
            val token = Prefs.token(ctx)
            var queued = false
            if (token != null) {
                try {
                    withContext(Dispatchers.IO) {
                        ApiClient.submitStoreUpdate(
                            Prefs.serverUrl(ctx), token, store.id, store.name, lat, lng, note,
                            ctx.getString(R.string.error_unknown), newName, cancel, entity.createdAt
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
                withContext(Dispatchers.IO) { dao.insertPendingUpdate(entity) }
            }
            _state.update {
                it.copy(
                    event = Event.Message(
                        ctx.getString(if (queued) R.string.update_queued else R.string.update_sent)
                    )
                )
            }
        }
    }

    suspend fun clearAllData() {
        withContext(Dispatchers.IO) { dao.clearAll() }
    }

    suspend fun visitsFor(storeId: Int): List<VisitEntity> =
        withContext(Dispatchers.IO) { dao.visitsForStore(storeId) }
}
