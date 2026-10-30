package com.repguide.app

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.os.Bundle
import android.text.Editable
import android.text.TextWatcher
import android.view.View
import android.view.inputmethod.InputMethodManager
import android.widget.AdapterView
import android.widget.ArrayAdapter
import android.widget.CheckBox
import android.widget.FrameLayout
import android.widget.PopupMenu
import android.widget.ProgressBar
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import androidx.preference.PreferenceManager
import androidx.recyclerview.widget.LinearLayoutManager
import com.repguide.app.api.ApiClient
import com.repguide.app.data.LandmarkEntity
import com.repguide.app.data.RegionEntity
import com.repguide.app.data.StoreEntity
import com.repguide.app.databinding.ActivityMainBinding
import com.repguide.app.databinding.DialogRouteFilterBinding
import com.repguide.app.databinding.DialogServerBinding
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.osmdroid.config.Configuration
import org.osmdroid.tileprovider.MapTileProviderArray
import org.osmdroid.tileprovider.MapTileProviderBasic
import org.osmdroid.tileprovider.modules.DatabaseFileArchive
import org.osmdroid.tileprovider.modules.MapTileApproximater
import org.osmdroid.tileprovider.modules.MapTileDownloader
import org.osmdroid.tileprovider.modules.MapTileFileArchiveProvider
import org.osmdroid.tileprovider.modules.TileWriter
import org.osmdroid.tileprovider.tilesource.TileSourceFactory
import org.osmdroid.tileprovider.util.SimpleRegisterReceiver
import org.osmdroid.util.BoundingBox
import org.osmdroid.util.GeoPoint
import org.osmdroid.views.overlay.FolderOverlay
import org.osmdroid.views.overlay.Marker
import org.osmdroid.views.overlay.Polygon
import org.osmdroid.views.overlay.Polyline
import org.osmdroid.views.overlay.mylocation.GpsMyLocationProvider
import org.osmdroid.views.overlay.mylocation.MyLocationNewOverlay
import java.io.File

class MainActivity : AppCompatActivity() {

    companion object {
        private val ALEPPO = GeoPoint(36.2025, 37.1347)

        private val PALETTE = intArrayOf(
            Color.parseColor("#1E88E5"), Color.parseColor("#43A047"),
            Color.parseColor("#E53935"), Color.parseColor("#8E24AA"),
            Color.parseColor("#FB8C00"), Color.parseColor("#00ACC1"),
            Color.parseColor("#6D4C41"), Color.parseColor("#C0CA33"),
            Color.parseColor("#3949AB"), Color.parseColor("#D81B60")
        )

        private val ARABIC_DIACRITICS = Regex("[\\u064B-\\u0652\\u0670\\u0640]")
        private val ALEF_VARIANTS = Regex("[أإآ]")

        fun normalizeArabic(s: String): String {
            var t = s.lowercase()
            t = t.replace(ARABIC_DIACRITICS, "")
            t = t.replace(ALEF_VARIANTS, "ا")
            t = t.replace('ى', 'ي')
            return t
        }

        fun digitsOnly(s: String?): String = s.orEmpty().filter { it.isDigit() }
    }

    private lateinit var binding: ActivityMainBinding
    private val vm: MainViewModel by viewModels()

    private lateinit var myLocationOverlay: MyLocationNewOverlay
    private val regionOverlay = FolderOverlay()
    private val labelOverlay = FolderOverlay()
    private val landmarkOverlay = FolderOverlay()
    private lateinit var storeOverlay: StoresOverlay

    private var regions: List<RegionEntity> = emptyList()
    private var regionsById: Map<Int, RegionEntity> = emptyMap()
    private var stores: List<StoreEntity> = emptyList()
    private var landmarks: List<LandmarkEntity> = emptyList()
    private var landmarksVisible = false
    private var selectedRegionId: Int? = null
    private var renderedRegions: List<RegionEntity>? = null
    private var routeLine: Polyline? = null
    private var routeOutline: Polyline? = null
    private var visibleStoreIds: Set<Int>? = null
    private var repNames: List<String> = emptyList()
    private var visitDays: List<String> = emptyList()
    private var repFilter: List<String>? = null
    private var dayFilter: List<String>? = null
    private var pinsHidden = false
    private var regionSheetOpen = false
    private var gpsConfirmMarker: Marker? = null
    private var gpsConfirmAction: (() -> Unit)? = null
    private lateinit var suggestionAdapter: StoreListAdapter

    private val locationPermissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            if (granted) enableMyLocation() else
                Toast.makeText(this, R.string.location_permission_denied, Toast.LENGTH_SHORT).show()
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Configuration.getInstance().load(this, PreferenceManager.getDefaultSharedPreferences(this))
        Configuration.getInstance().userAgentValue = packageName
        // مسار خاص بالتطبيق — يتجنب مشاكل صلاحيات التخزين المشترك في أندرويد الحديث
        Configuration.getInstance().osmdroidBasePath = File(filesDir, "osmdroid").apply { mkdirs() }

        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        binding.map.setMultiTouchControls(true)
        // أقصى تكبير مفيد: OSM تقدم بلاطات حقيقية حتى z19، ومن z20 إلى z22 يعرض التطبيق تقريباً مكبّراً من أدنى مستوى متوفر
        binding.map.minZoomLevel = 10.0
        binding.map.maxZoomLevel = 22.0
        binding.map.controller.setZoom(20.0)
        binding.map.controller.setCenter(ALEPPO)
        setupTileProvider()
        storeOverlay = StoresOverlay(binding.map) { store ->
            showStoreDetail(store, regionNameOf(store))
        }
        binding.map.overlays.add(regionOverlay)
        binding.map.overlays.add(storeOverlay)
        binding.map.overlays.add(labelOverlay)
        pinsHidden = Prefs.pinsHidden(this)
        if (pinsHidden) binding.map.overlays.remove(storeOverlay)

        myLocationOverlay = MyLocationNewOverlay(GpsMyLocationProvider(this), binding.map)
        binding.map.overlays.add(myLocationOverlay)

        binding.statusText.text =
            getString(R.string.user_welcome, Prefs.userName(this).orEmpty())

        suggestionAdapter = StoreListAdapter { store -> onStoreChosen(store) }
        binding.searchResults.layoutManager = LinearLayoutManager(this)
        binding.searchResults.adapter = suggestionAdapter

        binding.searchInput.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
            override fun afterTextChanged(s: Editable?) {
                applyFilters()
                updateSuggestions()
            }
        })

        binding.regionSpinner.onItemSelectedListener = object : AdapterView.OnItemSelectedListener {
            private var previousRegionId: Int? = null

            override fun onItemSelected(parent: AdapterView<*>?, view: View?, position: Int, id: Long) {
                selectedRegionId = if (position <= 0) null else regions.getOrNull(position - 1)?.id
                applyFilters()
                selectedRegionId?.let { regionId ->
                    zoomToRegion(regionId)
                    if (regionId != previousRegionId) showRegionStores(regionId)
                }
                previousRegionId = selectedRegionId
            }

            override fun onNothingSelected(parent: AdapterView<*>?) {}
        }

        binding.syncButton.setOnClickListener { vm.sync() }
        binding.syncButton.setOnLongClickListener {
            showServerDialog()
            true
        }

        binding.myLocationButton.setOnClickListener {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION)
                == PackageManager.PERMISSION_GRANTED
            ) {
                enableMyLocation()
            } else {
                locationPermissionLauncher.launch(Manifest.permission.ACCESS_FINE_LOCATION)
            }
        }

        binding.menuButton.setOnClickListener { showMenu() }

        binding.regionStoresButton.setOnClickListener {
            selectedRegionId?.let { showRegionStores(it) }
        }

        binding.gpsConfirmOk.setOnClickListener {
            binding.gpsConfirmBar.visibility = View.GONE
            clearGpsConfirmMarker()
            val action = gpsConfirmAction
            gpsConfirmAction = null
            action?.invoke()
        }
        binding.gpsConfirmCancel.setOnClickListener {
            binding.gpsConfirmBar.visibility = View.GONE
            clearGpsConfirmMarker()
            gpsConfirmAction = null
        }

        lifecycleScope.launch {
            repeatOnLifecycle(Lifecycle.State.STARTED) {
                vm.state.collect { state ->
                    state.event?.let { event ->
                        when (event) {
                            is MainViewModel.Event.Message ->
                                Toast.makeText(this@MainActivity, event.text, Toast.LENGTH_LONG).show()
                            MainViewModel.Event.Unauthorized -> logout(showMessage = true)
                        }
                        vm.consumeEvent()
                    }
                    binding.syncButton.isEnabled = !state.syncing
                    visibleStoreIds = state.visibleStoreIds
                    repNames = state.repNames
                    visitDays = state.visitDays
                    repFilter = state.repFilter
                    dayFilter = state.dayFilter
                    binding.statusText.text = if (state.syncing) {
                        getString(R.string.syncing)
                    } else {
                        getString(R.string.user_welcome, Prefs.userName(this@MainActivity).orEmpty()) +
                                " — " + getString(R.string.stores_count, state.stores.size)
                    }
                    onDataChanged(state.regions, state.stores, state.landmarks)
                }
            }
        }

        vm.loadLocal()
        vm.refreshPermissions()
    }

    private fun onDataChanged(newRegions: List<RegionEntity>, newStores: List<StoreEntity>, newLandmarks: List<LandmarkEntity>) {
        val regionsChanged = newRegions !== regions
        val landmarksChanged = newLandmarks !== landmarks
        regions = newRegions
        regionsById = newRegions.associateBy { it.id }
        stores = newStores
        landmarks = newLandmarks
        if (regionsChanged && renderedRegions !== newRegions) {
            renderedRegions = newRegions
            buildRegionOverlays()
            rebuildSpinner()
        }
        if (landmarksChanged && landmarksVisible) buildLandmarkOverlay()
        applyFilters()
    }

    /** طبقة المعالم (نقاط Google Earth) — تُبنى عند تفعيلها فقط وتظهر تسمياتها عند التكبير */
    private fun buildLandmarkOverlay() {
        landmarkOverlay.items.clear()
        for (lm in landmarks) {
            val marker = Marker(binding.map)
            marker.position = GeoPoint(lm.lat, lm.lng)
            marker.setTextIcon(lm.name)
            marker.setAnchor(Marker.ANCHOR_CENTER, Marker.ANCHOR_CENTER)
            marker.setOnMarkerClickListener { _, _ -> true }
            landmarkOverlay.add(marker)
        }
        binding.map.invalidate()
    }

    private fun toggleLandmarks() {
        landmarksVisible = !landmarksVisible
        if (landmarksVisible) {
            buildLandmarkOverlay()
            if (!binding.map.overlays.contains(landmarkOverlay)) {
                binding.map.overlays.add(0, landmarkOverlay)
            }
        } else {
            binding.map.overlays.remove(landmarkOverlay)
        }
        binding.map.invalidate()
    }

    private fun regionColor(region: RegionEntity, index: Int): Int {
        region.color?.let {
            runCatching { return Color.parseColor(it) }
        }
        return PALETTE[index % PALETTE.size]
    }

    private fun polygonPoints(json: String?): List<GeoPoint> {
        if (json == null) return emptyList()
        return runCatching {
            val arr = JSONArray(json)
            (0 until arr.length()).map { i ->
                val pair = arr.getJSONArray(i)
                GeoPoint(pair.getDouble(0), pair.getDouble(1))
            }
        }.getOrDefault(emptyList())
    }

    private fun buildRegionOverlays() {
        regionOverlay.items.clear()
        labelOverlay.items.clear()
        regions.forEachIndexed { index, region ->
            val color = regionColor(region, index)
            val points = polygonPoints(region.polygonJson)
            if (points.size >= 3) {
                val polygon = Polygon(binding.map)
                polygon.points = points
                polygon.fillPaint.color = color and 0x00FFFFFF or 0x3F000000
                polygon.outlinePaint.color = color
                polygon.outlinePaint.strokeWidth = 4f
                polygon.title = region.name
                regionOverlay.add(polygon)
            }
            if (region.labelLat != null && region.labelLng != null) {
                val label = Marker(binding.map)
                label.position = GeoPoint(region.labelLat, region.labelLng)
                label.setTextIcon(region.name)
                label.setAnchor(Marker.ANCHOR_CENTER, Marker.ANCHOR_CENTER)
                label.setOnMarkerClickListener { _, _ -> true }
                labelOverlay.add(label)
            }
        }
        binding.map.invalidate()
    }

    private fun rebuildSpinner() {
        val names = mutableListOf(getString(R.string.all_regions))
        names.addAll(regions.map { it.name })
        val adapter = ArrayAdapter(this, android.R.layout.simple_spinner_item, names)
        adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)
        val previous = selectedRegionId
        binding.regionSpinner.adapter = adapter
        val idx = regions.indexOfFirst { it.id == previous }
        binding.regionSpinner.setSelection(if (idx >= 0) idx + 1 else 0)
    }

    private fun applyFilters() {
        val query = normalizeArabic(binding.searchInput.text?.toString().orEmpty())
        val ids = visibleStoreIds
        val filtered = stores.filter { store ->
            (selectedRegionId == null || store.regionId == selectedRegionId) &&
                    (query.isEmpty() || normalizeArabic(store.name).contains(query)) &&
                    (ids == null || store.id in ids)
        }
        // المحلات بلا إحداثيات تظهر في البحث والقوائم لكن ليس على الخريطة
        storeOverlay.stores = filtered.filter { it.lat != null && it.lng != null }
        binding.map.invalidate()
        updateRegionStoresButton()
    }

    /** زر عائم لإعادة فتح قائمة محلات المنطقة بعد إغلاقها — يظهر فقط مع منطقة مختارة والقائمة مغلقة */
    private fun updateRegionStoresButton() {
        val regionId = selectedRegionId
        if (regionId == null || regionSheetOpen) {
            binding.regionStoresButton.visibility = View.GONE
            return
        }
        val ids = visibleStoreIds
        val count = stores.count { it.regionId == regionId && (ids == null || it.id in ids) }
        binding.regionStoresButton.text = getString(R.string.region_stores_reopen, count)
        binding.regionStoresButton.visibility = View.VISIBLE
    }

    private fun zoomToRegion(regionId: Int) {
        val region = regionsById[regionId] ?: return
        val points = polygonPoints(region.polygonJson)
        if (points.isEmpty()) return
        var minLat = 90.0
        var maxLat = -90.0
        var minLng = 180.0
        var maxLng = -180.0
        for (p in points) {
            minLat = minOf(minLat, p.latitude)
            maxLat = maxOf(maxLat, p.latitude)
            minLng = minOf(minLng, p.longitude)
            maxLng = maxOf(maxLng, p.longitude)
        }
        binding.map.post {
            binding.map.zoomToBoundingBox(
                BoundingBox(maxLat, maxLng, minLat, minLng), false, 100
            )
        }
    }

    private fun updateSuggestions() {
        val raw = binding.searchInput.text?.toString().orEmpty().trim()
        if (raw.isEmpty()) {
            hideSuggestions()
            return
        }
        val query = normalizeArabic(raw)
        val digits = digitsOnly(raw)
        val ids = visibleStoreIds
        val startsWith = mutableListOf<StoreEntity>()
        val contains = mutableListOf<StoreEntity>()
        for (store in stores) {
            if (ids != null && store.id !in ids) continue
            val name = normalizeArabic(store.name)
            val nameMatch = name.contains(query)
            val digitsMatch = digits.isNotEmpty() &&
                    (store.code?.toString()?.contains(digits) == true ||
                            (digits.length >= 2 && digitsOnly(store.phone).contains(digits)))
            if (!nameMatch && !digitsMatch) continue
            if (name.startsWith(query)) startsWith.add(store) else contains.add(store)
        }
        val matches = startsWith + contains
        if (matches.isEmpty()) {
            hideSuggestions()
            return
        }
        suggestionAdapter.submitList(
            matches.map { StoreListItem(it, regionNameOf(it)) }
        )
        binding.searchResults.visibility = View.VISIBLE
    }

    private fun hideSuggestions() {
        binding.searchResults.visibility = View.GONE
        suggestionAdapter.submitList(emptyList())
    }

    private fun regionNameOf(store: StoreEntity): String =
        store.regionId?.let { regionsById[it]?.name } ?: getString(R.string.no_region)

    /** يجلب زيارات المحل من القاعدة ثم يفتح بطاقة التفاصيل */
    private fun showStoreDetail(store: StoreEntity, regionName: String) {
        lifecycleScope.launch {
            val visits = vm.visitsFor(store.id)
            StoreDetailSheet.show(supportFragmentManager, store, regionName, ::onStoreAction, visits)
        }
    }

    private fun onStoreChosen(store: StoreEntity) {
        hideSuggestions()
        hideKeyboard()
        // مسح نص البحث لتعود كل المحلات للظهور — الاختيار للانتقال فقط وليس فلترة
        binding.searchInput.text?.clear()
        binding.regionSpinner.setSelection(0)
        // محل بلا إحداثيات: نفتح بطاقته مباشرة — يظهر فيها تنبيه غياب الموقع
        if (store.lat != null && store.lng != null) highlightAndZoomTo(store)
        showStoreDetail(store, regionNameOf(store))
    }

    private fun highlightAndZoomTo(store: StoreEntity) {
        storeOverlay.highlightedId = store.id
        zoomToStore(store)
        binding.map.invalidate()
    }

    private fun zoomToStore(store: StoreEntity) {
        if (store.lat == null || store.lng == null) {
            Toast.makeText(this, R.string.store_no_coords, Toast.LENGTH_LONG).show()
            return
        }
        val point = GeoPoint(store.lat, store.lng)
        binding.map.controller.setZoom(17.0)
        binding.map.controller.animateTo(point)
    }

    private fun hideKeyboard() {
        val imm = getSystemService(INPUT_METHOD_SERVICE) as InputMethodManager
        imm.hideSoftInputFromWindow(binding.searchInput.windowToken, 0)
        binding.searchInput.clearFocus()
    }

    private fun showRegionStores(regionId: Int) {
        val region = regionsById[regionId] ?: return
        val ids = visibleStoreIds
        val regionStores = stores
            .filter { it.regionId == regionId && (ids == null || it.id in ids) }
            .sortedBy { normalizeArabic(it.name) }
        if (regionStores.isEmpty()) return
        val items = regionStores.map {
            StoreListItem(it, it.ownerName?.takeIf { o -> o.isNotBlank() } ?: region.name)
        }
        regionSheetOpen = true
        updateRegionStoresButton()
        RegionStoresSheet.show(
            supportFragmentManager,
            getString(R.string.region_stores_title, region.name, regionStores.size),
            items,
            onSelect = { store ->
                if (store.lat != null && store.lng != null) highlightAndZoomTo(store)
                showStoreDetail(store, region.name)
            },
            onDismiss = {
                regionSheetOpen = false
                updateRegionStoresButton()
            }
        )
    }

    private fun enableMyLocation() {
        myLocationOverlay.enableMyLocation()
        myLocationOverlay.enableFollowLocation()
        myLocationOverlay.myLocation?.let {
            binding.map.controller.animateTo(it)
        }
        binding.map.invalidate()
    }

    private fun showMenu() {
        val perms = Prefs.permissions(this)
        val popup = PopupMenu(this, binding.menuButton)
        if (perms.canAddStore) popup.menu.add(getString(R.string.new_store))
        popup.menu.add(getString(R.string.sync))
        if (routeLine != null) popup.menu.add(getString(R.string.clear_route))
        popup.menu.add(getString(if (landmarksVisible) R.string.hide_landmarks else R.string.show_landmarks))
        popup.menu.add(getString(if (pinsHidden) R.string.show_pins else R.string.hide_pins))
        if (perms.canFilterByRep) {
            popup.menu.add(getString(R.string.route_filter) + routeFilterSummary())
        }
        if (perms.showServerAddress) popup.menu.add(getString(R.string.server_settings))
        if (perms.canDownloadMaps) {
            popup.menu.add(
                getString(
                    if (offlinePackageFile().exists()) R.string.offline_maps_installed
                    else R.string.offline_maps_download
                )
            )
        }
        popup.menu.add(getString(R.string.logout))
        popup.setOnMenuItemClickListener { item ->
            val title = item.title.toString()
            when {
                title == getString(R.string.new_store) -> showNewStoreDialog()
                title == getString(R.string.sync) -> vm.sync()
                title == getString(R.string.clear_route) -> clearRoute()
                title == getString(R.string.show_landmarks) ||
                        title == getString(R.string.hide_landmarks) -> toggleLandmarks()
                title == getString(R.string.hide_pins) ||
                        title == getString(R.string.show_pins) -> togglePins()
                title.startsWith(getString(R.string.route_filter)) -> showRouteFilterDialog()
                title == getString(R.string.server_settings) -> showServerDialog()
                title == getString(R.string.logout) -> logout(showMessage = false)
                title == getString(R.string.offline_maps_download) ||
                        title == getString(R.string.offline_maps_installed) -> onOfflineMapsClicked()
            }
            true
        }
        popup.show()
    }

    /** إخفاء/إظهار دبابيس المحلات فقط — تبقى المناطق والتسميات والمعالم ظاهرة */
    private fun togglePins() {
        pinsHidden = !pinsHidden
        Prefs.setPinsHidden(this, pinsHidden)
        if (pinsHidden) {
            binding.map.overlays.remove(storeOverlay)
        } else if (!binding.map.overlays.contains(storeOverlay)) {
            val idx = binding.map.overlays.indexOf(regionOverlay)
            binding.map.overlays.add(if (idx >= 0) idx + 1 else 0, storeOverlay)
        }
        binding.map.invalidate()
    }

    /** ملخص الفلتر الحالي لعرضه بجانب عنوان القائمة — فارغ عند غياب الفلتر */
    private fun routeFilterSummary(): String {
        val parts = listOfNotNull(
            repFilter?.takeIf { it.isNotEmpty() }?.joinToString("، "),
            dayFilter?.takeIf { it.isNotEmpty() }?.joinToString("، ")
        )
        return if (parts.isEmpty()) "" else ": " + parts.joinToString(" / ")
    }

    /** فلتر المسارات: اختيار متعدد للمندوبين (ضمن المسموحين) ولأيام الزيارة */
    private fun showRouteFilterDialog() {
        // عند وجود تقييد رؤية بمندوبين، لا تُعرض إلا أسماؤهم
        val allowed = Prefs.permissions(this).reps?.takeIf { it.isNotEmpty() }
        val shownReps = allowed?.let { a -> repNames.filter { a.contains(it) }.ifEmpty { a } } ?: repNames
        val dialogBinding = DialogRouteFilterBinding.inflate(layoutInflater)

        if (shownReps.isEmpty()) {
            dialogBinding.repsTitle.visibility = View.GONE
            dialogBinding.repsContainer.visibility = View.GONE
        }
        val repBoxes = shownReps.map { rep ->
            CheckBox(this).apply {
                text = rep
                isChecked = repFilter?.contains(rep) == true
            }
        }
        repBoxes.forEach { dialogBinding.repsContainer.addView(it) }

        if (visitDays.isEmpty()) {
            dialogBinding.daysTitle.visibility = View.GONE
            dialogBinding.daysContainer.visibility = View.GONE
        }
        val dayBoxes = visitDays.map { day ->
            CheckBox(this).apply {
                text = day
                isChecked = dayFilter?.contains(day) == true
            }
        }
        dayBoxes.forEach { dialogBinding.daysContainer.addView(it) }

        AlertDialog.Builder(this)
            .setTitle(R.string.route_filter)
            .setView(dialogBinding.root)
            .setPositiveButton(R.string.apply) { _, _ ->
                val reps = repBoxes.filter { it.isChecked }.map { it.text.toString() }.ifEmpty { null }
                val days = dayBoxes.filter { it.isChecked }.map { it.text.toString() }.ifEmpty { null }
                vm.setRouteFilters(reps, days)
            }
            .setNeutralButton(R.string.clear) { _, _ -> vm.setRouteFilters(null, null) }
            .setNegativeButton(R.string.cancel, null)
            .show()
    }

    private fun onStoreAction(store: StoreEntity, action: Int) {
        when (action) {
            StoreDetailSheet.ACTION_DRAW_ROUTE -> drawRouteTo(store)
            StoreDetailSheet.ACTION_UPDATE_LOCATION,
            StoreDetailSheet.ACTION_SET_LOCATION -> {
                val loc = currentLocationOrWarn() ?: return
                confirmGpsPoint(
                    loc,
                    getString(
                        R.string.confirm_update_location,
                        storeLabel(store),
                        loc.latitude,
                        loc.longitude
                    )
                ) {
                    vm.submitStoreUpdate(store, loc.latitude, loc.longitude, null)
                }
            }
            StoreDetailSheet.ACTION_ADD_NOTE -> showNoteDialog(store, null)
            StoreDetailSheet.ACTION_CANCEL_STORE -> {
                AlertDialog.Builder(this)
                    .setTitle(R.string.cancel_store)
                    .setMessage(
                        getString(R.string.confirm_cancel_store) + "\n" + storeLabel(store)
                    )
                    .setPositiveButton(R.string.confirm) { _, _ ->
                        vm.submitStoreUpdate(store, null, null, null, cancel = true)
                    }
                    .setNegativeButton(R.string.back, null)
                    .show()
            }
            StoreDetailSheet.ACTION_RENAME -> showRenameDialog(store)
        }
    }

    /** اسم المحل مع الكود إن وُجد: «اسم المحل (الكود: N)» */
    private fun storeLabel(store: StoreEntity): String =
        store.code?.let { getString(R.string.store_name_with_code, store.name, it) } ?: store.name

    private fun drawRouteTo(store: StoreEntity) {
        if (store.lat == null || store.lng == null) {
            Toast.makeText(this, R.string.store_no_coords, Toast.LENGTH_LONG).show()
            return
        }
        val from = currentLocationOrWarn() ?: return
        val serverUrl = Prefs.serverUrl(this)
        val token = Prefs.token(this) ?: return logout(showMessage = true)
        Toast.makeText(this, R.string.route_calculating, Toast.LENGTH_SHORT).show()
        lifecycleScope.launch {
            try {
                val route = withContext(Dispatchers.IO) {
                    ApiClient.fetchRoute(
                        serverUrl, token,
                        from.latitude, from.longitude, store.lat, store.lng,
                        getString(R.string.error_unknown)
                    )
                }
                showRoute(route)
            } catch (e: Exception) {
                if (e is ApiClient.ApiException && e.status == 401) logout(showMessage = true)
                else Toast.makeText(
                    this@MainActivity,
                    getString(R.string.route_failed, e.message ?: getString(R.string.error_network)),
                    Toast.LENGTH_LONG
                ).show()
            }
        }
    }

    private fun showRoute(route: ApiClient.Route) {
        clearRoute()
        val points = route.points.map { GeoPoint(it[0], it[1]) }
        // إطار أبيض سميك تحت الخط الرئيسي ليتميز المسار عن المضلعات والتسميات
        val outline = Polyline(binding.map)
        outline.outlinePaint.color = Color.WHITE
        outline.outlinePaint.strokeWidth = 14f
        outline.setPoints(points)
        val line = Polyline(binding.map)
        line.outlinePaint.color = Color.parseColor("#1565C0")
        line.outlinePaint.strokeWidth = 10f
        line.setPoints(points)
        // تحت الدبابيس والمضلعات
        binding.map.overlays.add(0, outline)
        binding.map.overlays.add(1, line)
        routeOutline = outline
        routeLine = line
        val km = route.distanceMeters / 1000.0
        val minutes = Math.round(route.durationSeconds / 60.0)
        Toast.makeText(
            this,
            getString(R.string.route_summary, String.format("%.1f", km), minutes),
            Toast.LENGTH_LONG
        ).show()
        binding.map.post {
            binding.map.zoomToBoundingBox(BoundingBox.fromGeoPoints(points), false, 120)
        }
        binding.map.invalidate()
    }

    private fun clearRoute() {
        routeLine?.let { binding.map.overlays.remove(it) }
        routeLine = null
        routeOutline?.let { binding.map.overlays.remove(it) }
        routeOutline = null
        binding.map.invalidate()
    }

    private fun currentLocationOrWarn(): GeoPoint? {
        val loc = myLocationOverlay.myLocation
        if (loc == null) {
            enableMyLocation()
            Toast.makeText(this, R.string.new_store_no_location, Toast.LENGTH_LONG).show()
        }
        return loc
    }

    /** دبوس مؤقت مميز (أزرق) يوضع على موقع GPS الملتقط أثناء تأكيده */
    private fun showGpsConfirmMarker(point: GeoPoint) {
        clearGpsConfirmMarker()
        val marker = Marker(binding.map)
        marker.position = point
        marker.icon = ContextCompat.getDrawable(this, R.drawable.ic_pin)?.mutate()?.apply {
            setTint(Color.parseColor("#1E88E5"))
        }
        marker.setAnchor(Marker.ANCHOR_CENTER, Marker.ANCHOR_BOTTOM)
        marker.setOnMarkerClickListener { _, _ -> true }
        gpsConfirmMarker = marker
        binding.map.overlays.add(marker)
        binding.map.controller.setZoom(18.0)
        binding.map.controller.animateTo(point)
        binding.map.invalidate()
    }

    private fun clearGpsConfirmMarker() {
        gpsConfirmMarker?.let { binding.map.overlays.remove(it) }
        gpsConfirmMarker = null
        binding.gpsConfirmBar.visibility = View.GONE
        binding.map.invalidate()
    }

    /**
     * تأكيد موقع GPS: تكبير الخريطة على النقطة مع دبوس مؤقت ثم شريط تأكيد
     * أسفل الشاشة (غير حاجب للخريطة) يعرض دقة GPS عند توفرها.
     * عند الإلغاء يُزال الدبوس ولا يُرسل شيء.
     */
    private fun confirmGpsPoint(point: GeoPoint, message: String, onConfirm: () -> Unit) {
        showGpsConfirmMarker(point)
        val accuracy = myLocationOverlay.lastFix?.takeIf { it.hasAccuracy() }?.accuracy
        val accuracyText = accuracy?.let { "\n" + getString(R.string.gps_accuracy, it.toInt()) }.orEmpty()
        gpsConfirmAction = onConfirm
        binding.gpsConfirmText.text =
            getString(R.string.confirm_location_title) + "\n" + message + accuracyText
        binding.gpsConfirmBar.visibility = View.VISIBLE
    }

    private fun showRenameDialog(store: StoreEntity) {
        val input = android.widget.EditText(this).apply {
            hint = getString(R.string.new_store_name_hint)
        }
        val pad = (24 * resources.displayMetrics.density).toInt()
        val container = FrameLayout(this).apply {
            setPadding(pad, pad / 2, pad, 0)
            addView(input)
        }
        AlertDialog.Builder(this)
            .setTitle(getString(R.string.rename_store_title, storeLabel(store)))
            .setView(container)
            .setPositiveButton(R.string.save) { _, _ ->
                val name = input.text?.toString()?.trim().orEmpty()
                if (name.isEmpty()) {
                    Toast.makeText(this, R.string.new_store_name_required, Toast.LENGTH_LONG).show()
                    return@setPositiveButton
                }
                if (name == store.name.trim()) {
                    Toast.makeText(this, R.string.rename_store_unchanged, Toast.LENGTH_LONG).show()
                    return@setPositiveButton
                }
                vm.submitStoreUpdate(store, null, null, null, newName = name)
            }
            .setNegativeButton(R.string.cancel, null)
            .show()
    }

    private fun showNoteDialog(store: StoreEntity, location: GeoPoint?) {
        val input = android.widget.EditText(this).apply {
            hint = getString(R.string.note_hint)
        }
        val pad = (24 * resources.displayMetrics.density).toInt()
        val container = FrameLayout(this).apply {
            setPadding(pad, pad / 2, pad, 0)
            addView(input)
        }
        AlertDialog.Builder(this)
            .setTitle(getString(R.string.note_dialog_title, storeLabel(store)))
            .setView(container)
            .setPositiveButton(R.string.send) { _, _ ->
                val note = input.text?.toString()?.trim().orEmpty()
                if (note.isEmpty()) {
                    Toast.makeText(this, R.string.note_required, Toast.LENGTH_LONG).show()
                    return@setPositiveButton
                }
                vm.submitStoreUpdate(store, location?.latitude, location?.longitude, note)
            }
            .setNegativeButton(R.string.cancel, null)
            .show()
    }

    private fun showNewStoreDialog() {
        val location = myLocationOverlay.myLocation
        if (location == null) {
            enableMyLocation()
            Toast.makeText(this, R.string.new_store_no_location, Toast.LENGTH_LONG).show()
            return
        }
        confirmGpsPoint(
            location,
            getString(R.string.new_store_coords, location.latitude, location.longitude)
        ) {
            showNewStoreNameDialog(location)
        }
    }

    private fun showNewStoreNameDialog(location: GeoPoint) {
        val input = android.widget.EditText(this).apply {
            hint = getString(R.string.new_store_name_hint)
        }
        val pad = (24 * resources.displayMetrics.density).toInt()
        val container = FrameLayout(this).apply {
            setPadding(pad, pad / 2, pad, 0)
            addView(input)
        }
        AlertDialog.Builder(this)
            .setTitle(R.string.new_store_title)
            .setMessage(getString(R.string.new_store_coords, location.latitude, location.longitude))
            .setView(container)
            .setPositiveButton(R.string.save) { _, _ ->
                val name = input.text?.toString()?.trim().orEmpty()
                if (name.isEmpty()) {
                    Toast.makeText(this, R.string.new_store_name_required, Toast.LENGTH_LONG).show()
                    return@setPositiveButton
                }
                vm.submitStore(name, location.latitude, location.longitude)
            }
            .setNegativeButton(R.string.cancel, null)
            .show()
    }

    private fun offlinePackageFile() =
        File(Configuration.getInstance().osmdroidBasePath, "offline.sqlite")

    /** أرشيف SQLite أولاً، ثم التنزيل من الشبكة عند غياب البلاطة من الأرشيف. */
    private fun setupTileProvider() {
        val tileSource = TileSourceFactory.MAPNIK
        val archive = offlinePackageFile()
        if (archive.exists() && archive.length() > 0) {
            val dbArchive = runCatching {
                DatabaseFileArchive.getDatabaseFileArchive(archive)
            }.getOrNull()
            val valid = dbArchive?.let {
                runCatching { it.tileSources.isNotEmpty() }.getOrDefault(false)
            } ?: false
            if (valid && dbArchive != null) {
                dbArchive.setIgnoreTileSource(true)
                val receiver = SimpleRegisterReceiver(this)
                val archiveProvider = MapTileFileArchiveProvider(receiver, tileSource, arrayOf(dbArchive))
                val downloader = MapTileDownloader(tileSource, TileWriter())
                // عند طلب بلاطة غير موجودة (مثلاً z18/19 أوفلاين) يُولَّد تقريب مكبّر من بلاطات الحزمة بدل مربع رمادي
                val approximater = MapTileApproximater()
                approximater.addProvider(archiveProvider)
                binding.map.setTileProvider(
                    MapTileProviderArray(
                        tileSource, receiver,
                        arrayOf(archiveProvider, downloader, approximater)
                    )
                )
                binding.map.invalidate()
                return
            }
            // ملف تالف أو غير متوافق — حذفه ليعاد تنزيله
            runCatching { dbArchive?.close() }
            archive.delete()
        }
        binding.map.setTileProvider(MapTileProviderBasic(this, tileSource))
        binding.map.invalidate()
    }

    private fun onOfflineMapsClicked() {
        val installed = offlinePackageFile()
        if (installed.exists()) {
            AlertDialog.Builder(this)
                .setTitle(R.string.offline_maps_installed)
                .setMessage(getString(R.string.offline_maps_size_mb, installed.length() / 1048576.0))
                .setPositiveButton(R.string.offline_maps_redownload) { _, _ -> startOfflineDownload() }
                .setNegativeButton(R.string.offline_maps_delete) { _, _ ->
                    installed.delete()
                    setupTileProvider()
                    Toast.makeText(this, R.string.offline_maps_deleted, Toast.LENGTH_SHORT).show()
                }
                .setNeutralButton(R.string.cancel, null)
                .show()
            return
        }
        startOfflineDownload()
    }

    private fun startOfflineDownload() {
        val serverUrl = Prefs.serverUrl(this)
        val token = Prefs.token(this) ?: return logout(showMessage = true)
        lifecycleScope.launch {
            val info = try {
                withContext(Dispatchers.IO) {
                    ApiClient.fetchTilesInfo(serverUrl, token, getString(R.string.error_unknown))
                }
            } catch (e: Exception) {
                handleOfflineError(e)
                return@launch
            }
            if (!info.available) {
                Toast.makeText(this@MainActivity, R.string.offline_maps_unavailable, Toast.LENGTH_LONG).show()
                return@launch
            }
            AlertDialog.Builder(this@MainActivity)
                .setTitle(R.string.offline_maps_download)
                .setMessage(getString(R.string.offline_maps_confirm, info.size / 1048576.0))
                .setPositiveButton(R.string.download) { _, _ ->
                    downloadPackage(serverUrl, token)
                }
                .setNegativeButton(R.string.cancel, null)
                .show()
        }
    }

    private fun downloadPackage(serverUrl: String, token: String) {
        val progressBar = ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal)
            .apply { max = 100 }
        val pad = (24 * resources.displayMetrics.density).toInt()
        val container = FrameLayout(this).apply {
            setPadding(pad, pad, pad, pad)
            addView(
                progressBar,
                FrameLayout.LayoutParams(
                    FrameLayout.LayoutParams.MATCH_PARENT,
                    FrameLayout.LayoutParams.WRAP_CONTENT
                )
            )
        }
        val dialog = AlertDialog.Builder(this)
            .setTitle(R.string.offline_maps_downloading)
            .setView(container)
            .setCancelable(false)
            .create()
        dialog.show()

        val dest = offlinePackageFile()
        val tmp = File(dest.parentFile, "offline.sqlite.tmp")
        lifecycleScope.launch {
            try {
                dest.parentFile?.mkdirs()
                withContext(Dispatchers.IO) {
                    ApiClient.downloadTilesPackage(
                        serverUrl, token, tmp, getString(R.string.error_unknown)
                    ) { percent -> progressBar.post { progressBar.progress = percent } }
                }
                // التحقق من سلامة الحزمة قبل اعتمادها
                val probe = withContext(Dispatchers.IO) {
                    runCatching { DatabaseFileArchive.getDatabaseFileArchive(tmp) }.getOrNull()
                }
                val valid = probe?.let {
                    runCatching { it.tileSources.isNotEmpty() }
                        .getOrDefault(false)
                } ?: false
                runCatching { probe?.close() }
                if (!valid) {
                    tmp.delete()
                    throw Exception(getString(R.string.offline_maps_invalid))
                }
                // استبدال آمن: لا يُحذف الملف القديم قبل نجاح وضع الجديد
                withContext(Dispatchers.IO) {
                    val backup = File(dest.parentFile, "offline.sqlite.bak")
                    backup.delete()
                    if (dest.exists() && !dest.renameTo(backup)) dest.delete()
                    if (!tmp.renameTo(dest)) {
                        tmp.inputStream().use { input ->
                            dest.outputStream().use { output -> input.copyTo(output) }
                        }
                        tmp.delete()
                    }
                    backup.delete()
                }
                setupTileProvider()
                Toast.makeText(this@MainActivity, R.string.offline_maps_success, Toast.LENGTH_LONG).show()
            } catch (e: Exception) {
                tmp.delete()
                handleOfflineError(e)
            } finally {
                dialog.dismiss()
            }
        }
    }

    private fun handleOfflineError(e: Exception) {
        when (e) {
            is ApiClient.ApiException -> {
                if (e.status == 401) logout(showMessage = true)
                else Toast.makeText(
                    this, getString(R.string.offline_maps_failed, e.message), Toast.LENGTH_LONG
                ).show()
            }
            else -> Toast.makeText(
                this,
                getString(R.string.offline_maps_failed, e.message ?: getString(R.string.error_network)),
                Toast.LENGTH_LONG
            ).show()
        }
    }

    private fun showServerDialog() {
        val dialogBinding = DialogServerBinding.inflate(layoutInflater)
        dialogBinding.serverUrlInput.setText(Prefs.serverUrl(this))
        AlertDialog.Builder(this)
            .setTitle(R.string.server_settings)
            .setView(dialogBinding.root)
            .setPositiveButton(R.string.save) { _, _ ->
                val url = dialogBinding.serverUrlInput.text?.toString().orEmpty()
                if (url.isNotBlank()) Prefs.setServerUrl(this, url)
            }
            .setNegativeButton(R.string.cancel, null)
            .show()
    }

    private fun logout(showMessage: Boolean) {
        Prefs.clearSession(this)
        lifecycleScope.launch {
            vm.clearAllData()
            if (showMessage) {
                Toast.makeText(this@MainActivity, R.string.session_expired, Toast.LENGTH_LONG).show()
            }
            startActivity(Intent(this@MainActivity, LoginActivity::class.java))
            finish()
        }
    }

    override fun onResume() {
        super.onResume()
        binding.map.onResume()
    }

    override fun onPause() {
        super.onPause()
        binding.map.onPause()
    }
}
