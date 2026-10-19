package com.repguide.app

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.fragment.app.FragmentManager
import com.google.android.material.bottomsheet.BottomSheetDialogFragment
import com.repguide.app.data.StoreEntity
import com.repguide.app.databinding.DialogStoreBinding

class StoreDetailSheet : BottomSheetDialogFragment() {

    companion object {
        const val ACTION_UPDATE_LOCATION = 1
        const val ACTION_ADD_NOTE = 2
        const val ACTION_UPDATE_BOTH = 3

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

        val notes = args.getString(ARG_NOTES)
        binding.rowNotes.visibility = if (notes.isNullOrBlank()) View.GONE else View.VISIBLE
        binding.notesValue.text = notes.orEmpty()

        val onAction = pendingAction
        val store = pendingStore
        if (onAction == null || store == null) {
            binding.updateLocationButton.visibility = View.GONE
            binding.addNoteButton.visibility = View.GONE
            binding.updateBothButton.visibility = View.GONE
        } else {
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

    override fun onDestroyView() {
        super.onDestroyView()
        pendingStore = null
        pendingAction = null
    }
}
