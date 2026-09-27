package com.repguide.app

import android.os.Bundle
import android.text.Editable
import android.text.TextWatcher
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.fragment.app.FragmentManager
import androidx.recyclerview.widget.LinearLayoutManager
import com.google.android.material.bottomsheet.BottomSheetDialogFragment
import com.repguide.app.data.StoreEntity
import com.repguide.app.databinding.SheetRegionStoresBinding

class RegionStoresSheet : BottomSheetDialogFragment() {

    companion object {
        private var pendingTitle: String = ""
        private var pendingItems: List<StoreListItem> = emptyList()
        private var pendingOnSelect: ((StoreEntity) -> Unit)? = null

        fun show(
            fm: FragmentManager,
            title: String,
            items: List<StoreListItem>,
            onSelect: (StoreEntity) -> Unit
        ) {
            pendingTitle = title
            pendingItems = items
            pendingOnSelect = onSelect
            RegionStoresSheet().show(fm, "region_stores")
        }
    }

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        val binding = SheetRegionStoresBinding.inflate(inflater, container, false)

        binding.sheetTitle.text = pendingTitle

        val adapter = StoreListAdapter { store ->
            dismiss()
            pendingOnSelect?.invoke(store)
        }
        binding.sheetList.layoutManager = LinearLayoutManager(requireContext())
        binding.sheetList.adapter = adapter
        adapter.submitList(pendingItems)

        binding.sheetSearch.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
            override fun afterTextChanged(s: Editable?) {
                val q = MainActivity.normalizeArabic(s?.toString().orEmpty())
                adapter.submitList(
                    if (q.isEmpty()) pendingItems
                    else pendingItems.filter {
                        MainActivity.normalizeArabic(it.store.name).contains(q)
                    }
                )
            }
        })

        return binding.root
    }

    override fun onDestroyView() {
        super.onDestroyView()
        pendingOnSelect = null
    }
}
