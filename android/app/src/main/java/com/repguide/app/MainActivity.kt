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
import com.repguide.app.data.RegionEntity
import com.repguide.app.data.StoreEntity
import com.repguide.app.databinding.ActivityMainBinding
import com.repguide.app.databinding.DialogServerBinding
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.osmdroid.config.Configuration
import org.osmdroid.tileprovider.MapTileProviderArray
import org.osmdroid.tileprovider.MapTileProviderBasic
import org.osmdroid.tileprovider.modules.DatabaseFileArchive
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

        private const val MAX_SUGGESTIONS = 10
    }

    private lateinit var binding: ActivityMainBinding
    private val vm: MainViewModel by viewModels()

    private lateinit var myLocationOverlay: MyLocationNewOverlay
    private val regionOverlay = FolderOverlay()
    private val labelOverlay = FolderOverlay()
    private lateinit var storeOverlay: StoresOverlay

    private var regions: List<RegionEntity> = emptyList()
    private var regionsById: Map<Int, RegionEntity> = emptyMap()
    private var stores: List<StoreEntity> = emptyList()
    private var selectedRegionId: Int? = null
    private var renderedRegions: List<RegionEntity>? = null
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

        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        binding.map.setMultiTouchControls(true)
        binding.map.controller.setZoom(12.0)
        binding.map.controller.setCenter(ALEPPO)
        setupTileProvider()
        storeOverlay = StoresOverlay(binding.map) { store ->
            StoreDetailSheet.show(supportFragmentManager, store, regionNameOf(store))
        }
        binding.map.overlays.add(regionOverlay)
        binding.map.overlays.add(storeOverlay)
        binding.map.overlays.add(labelOverlay)

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
                    binding.statusText.text = if (state.syncing) {
                        getString(R.string.syncing)
                    } else {
                        getString(R.string.user_welcome, Prefs.userName(this@MainActivity).orEmpty()) +
                                " — " + getString(R.string.stores_count, state.stores.size)
                    }
                    onDataChanged(state.regions, state.stores)
                }
            }
        }

        vm.loadLocal()
    }

    private fun onDataChanged(newRegions: List<RegionEntity>, newStores: List<StoreEntity>) {
        val regionsChanged = newRegions !== regions
        regions = newRegions
        regionsById = newRegions.associateBy { it.id }
        stores = newStores
        if (regionsChanged && renderedRegions !== newRegions) {
            renderedRegions = newRegions
            buildRegionOverlays()
            rebuildSpinner()
        }
        applyFilters()
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
        val filtered = stores.filter { store ->
            (selectedRegionId == null || store.regionId == selectedRegionId) &&
                    (query.isEmpty() || normalizeArabic(store.name).contains(query))
        }
        storeOverlay.stores = filtered
        binding.map.invalidate()
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
        val startsWith = mutableListOf<StoreEntity>()
        val contains = mutableListOf<StoreEntity>()
        for (store in stores) {
            val name = normalizeArabic(store.name)
            val nameMatch = name.contains(query)
            val phoneMatch = digits.length >= 2 && digitsOnly(store.phone).contains(digits)
            if (!nameMatch && !phoneMatch) continue
            if (name.startsWith(query)) startsWith.add(store) else contains.add(store)
            if (startsWith.size + contains.size >= MAX_SUGGESTIONS * 3) break
        }
        val matches = (startsWith + contains).take(MAX_SUGGESTIONS)
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

    private fun onStoreChosen(store: StoreEntity) {
        hideSuggestions()
        hideKeyboard()
        zoomToStore(store)
        StoreDetailSheet.show(supportFragmentManager, store, regionNameOf(store))
    }

    private fun zoomToStore(store: StoreEntity) {
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
        val regionStores = stores
            .filter { it.regionId == regionId }
            .sortedBy { normalizeArabic(it.name) }
        if (regionStores.isEmpty()) return
        val items = regionStores.map {
            StoreListItem(it, it.ownerName?.takeIf { o -> o.isNotBlank() } ?: region.name)
        }
        RegionStoresSheet.show(
            supportFragmentManager,
            getString(R.string.region_stores_title, region.name, regionStores.size),
            items
        ) { store ->
            zoomToStore(store)
            StoreDetailSheet.show(supportFragmentManager, store, region.name)
        }
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
        val popup = PopupMenu(this, binding.menuButton)
        popup.menu.add(getString(R.string.sync))
        popup.menu.add(getString(R.string.server_settings))
        popup.menu.add(
            getString(
                if (offlinePackageFile().exists()) R.string.offline_maps_installed
                else R.string.offline_maps_download
            )
        )
        popup.menu.add(getString(R.string.logout))
        popup.setOnMenuItemClickListener { item ->
            when (item.title.toString()) {
                getString(R.string.sync) -> vm.sync()
                getString(R.string.server_settings) -> showServerDialog()
                getString(R.string.logout) -> logout(showMessage = false)
                getString(R.string.offline_maps_download),
                getString(R.string.offline_maps_installed) -> onOfflineMapsClicked()
            }
            true
        }
        popup.show()
    }

    private fun offlinePackageFile() =
        File(Configuration.getInstance().osmdroidBasePath, "offline.sqlite")

    /** أرشيف SQLite أولاً، ثم التنزيل من الشبكة عند غياب البلاطة من الأرشيف. */
    private fun setupTileProvider() {
        val tileSource = TileSourceFactory.MAPNIK
        val archive = offlinePackageFile()
        if (archive.exists() && archive.length() > 0) {
            runCatching {
                val receiver = SimpleRegisterReceiver(this)
                val dbArchive = DatabaseFileArchive.getDatabaseFileArchive(archive)
                val archiveProvider = MapTileFileArchiveProvider(receiver, tileSource, arrayOf(dbArchive))
                val downloader = MapTileDownloader(tileSource, TileWriter())
                binding.map.setTileProvider(
                    MapTileProviderArray(tileSource, receiver, arrayOf(archiveProvider, downloader))
                )
                binding.map.invalidate()
                return
            }
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
                withContext(Dispatchers.IO) {
                    ApiClient.downloadTilesPackage(
                        serverUrl, token, tmp, getString(R.string.error_unknown)
                    ) { percent -> progressBar.post { progressBar.progress = percent } }
                }
                dest.delete()
                tmp.renameTo(dest)
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
