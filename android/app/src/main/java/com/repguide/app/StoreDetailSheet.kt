package com.repguide.app

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentManager
import com.google.android.material.bottomsheet.BottomSheetDialogFragment
import com.repguide.app.data.StoreEntity
import com.repguide.app.databinding.DialogStoreBinding

class StoreDetailSheet : BottomSheetDialogFragment() {

    companion object {
        const val ACTION_UPDATE_LOCATION = 1
        const val ACTION_ADD_NOTE = 2
        const val ACTION_UPDATE_BOTH = 3
        const val ACTION_DRAW_ROUTE = 4

        private const val ARG_ID = "id"
        private const val ARG_NAME = "name"
        private const val ARG_OWNER = "owner"
        private const val ARG_PHONE = "phone"
        private const val ARG_REGION = "region"
        private const val ARG_NOTES = "notes"

        private var pendingStore: StoreEntity? = null
        private var pendingAction: ((StoreEntity, Int) -> Unit)? = null

        fun show(
            fm: FragmentManager,
            store: StoreEntity,
            regionName: String?,
            onAction: ((StoreEntity, Int) -> Unit)? = null
        ) {
            pendingStore = store
            pendingAction = onAction
            StoreDetailSheet().apply {
                arguments = Bundle().apply {
                    putInt(ARG_ID, store.id)
                    putString(ARG_NAME, store.name)
                    putString(ARG_OWNER, store.ownerName)
                    putString(ARG_PHONE, store.phone)
                    putString(ARG_REGION, regionName)
                    putString(ARG_NOTES, store.notes)
                }
            }.show(fm, "store_detail")
        }
    }

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        val binding = DialogStoreBinding.inflate(inflater, container, false)
        val args = requireArguments()

        binding.storeNameText.text = args.getString(ARG_NAME).orEmpty()

        val owner = args.getString(ARG_OWNER)
        binding.rowOwner.visibility = if (owner.isNullOrBlank()) View.GONE else View.VISIBLE
        binding.ownerValue.text = owner.orEmpty()

        val phone = args.getString(ARG_PHONE)
        binding.rowPhone.visibility = if (phone.isNullOrBlank()) View.GONE else View.VISIBLE
        binding.phoneValue.text = phone.orEmpty()
        binding.callButton.setOnClickListener {
            if (!phone.isNullOrBlank()) {
                startActivity(Intent(Intent.ACTION_DIAL, Uri.parse("tel:${phone.trim()}")))
            }
        }

        val region = args.getString(ARG_REGION)
        binding.regionValue.text = region ?: getString(R.string.no_region)

        // الكود والعنوان والسلات من الكيان مباشرة
        val store2 = pendingStore
        if (store2?.code != null) {
            binding.codeValue.text = store2.code.toString()
        } else {
            binding.rowCode.visibility = View.GONE
        }
        if (!store2?.address.isNullOrBlank()) {
            binding.addressValue.text = store2?.address
        } else {
            binding.rowAddress.visibility = View.GONE
        }
        if (store2 != null) buildBasketRows(binding, store2)

        val notes = args.getString(ARG_NOTES)
        binding.rowNotes.visibility = if (notes.isNullOrBlank()) View.GONE else View.VISIBLE
        binding.notesValue.text = notes.orEmpty()

        val onAction = pendingAction
        val store = pendingStore
        if (onAction == null || store == null) {
            binding.drawRouteButton.visibility = View.GONE
            binding.updateLocationButton.visibility = View.GONE
            binding.addNoteButton.visibility = View.GONE
            binding.updateBothButton.visibility = View.GONE
        } else {
            binding.drawRouteButton.setOnClickListener {
                dismiss()
                onAction(store, ACTION_DRAW_ROUTE)
            }
            binding.updateLocationButton.setOnClickListener {
                dismiss()
                onAction(store, ACTION_UPDATE_LOCATION)
            }
            binding.addNoteButton.setOnClickListener {
                dismiss()
                onAction(store, ACTION_ADD_NOTE)
            }
            binding.updateBothButton.setOnClickListener {
                dismiss()
                onAction(store, ACTION_UPDATE_BOTH)
            }
        }

        return binding.root
    }

    /** يبني أقسام السلات الثلاث — يظهر القسم فقط إن وُجدت بياناته */
    private fun buildBasketRows(binding: DialogStoreBinding, store: StoreEntity) {
        val ctx = requireContext()
        val density = resources.displayMetrics.density
        val baskets = listOf(
            Triple(store.b1Rep, store.b1Channel, store.b1Day),
            Triple(store.b2Rep, store.b2Channel, store.b2Day),
            Triple(store.b3Rep, store.b3Channel, store.b3Day)
        )
        baskets.forEachIndexed { index, (rep, channel, day) ->
            if (rep.isNullOrBlank() && channel.isNullOrBlank() && day.isNullOrBlank()) return@forEachIndexed

            val title = android.widget.TextView(ctx).apply {
                text = getString(R.string.basket_title, index + 1)
                setTypeface(null, android.graphics.Typeface.BOLD)
                textSize = 15f
                setTextColor(ContextCompat.getColor(ctx, com.google.android.material.R.color.material_on_surface_emphasis_high_type))
                setPadding(0, (10 * density).toInt(), 0, (4 * density).toInt())
            }
            binding.basketsContainer.addView(title)

            val fields = listOf(
                getString(R.string.salesperson) to rep,
                getString(R.string.classification) to channel,
                getString(R.string.visit_day) to day
            )
            for ((label, value) in fields) {
                if (value.isNullOrBlank()) continue
                val row = android.widget.TextView(ctx).apply {
                    text = "$label $value"
                    textSize = 14f
                    setPadding((12 * density).toInt(), (2 * density).toInt(), 0, (2 * density).toInt())
                }
                binding.basketsContainer.addView(row)
            }
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        pendingStore = null
        pendingAction = null
    }
}
