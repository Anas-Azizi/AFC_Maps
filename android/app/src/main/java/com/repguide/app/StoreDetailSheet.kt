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
        private const val ARG_NAME = "name"
        private const val ARG_OWNER = "owner"
        private const val ARG_PHONE = "phone"
        private const val ARG_REGION = "region"
        private const val ARG_NOTES = "notes"

        fun show(fm: FragmentManager, store: StoreEntity, regionName: String?) {
            StoreDetailSheet().apply {
                arguments = Bundle().apply {
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

        return binding.root
    }
}
