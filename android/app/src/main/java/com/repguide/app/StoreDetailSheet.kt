package com.repguide.app

import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.fragment.app.FragmentManager
import com.google.android.material.bottomsheet.BottomSheetDialogFragment
import com.repguide.app.data.StoreEntity
import com.repguide.app.data.VisitEntity
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
        private var pendingVisits: List<VisitEntity> = emptyList()
        private var pendingAction: ((StoreEntity, Int) -> Unit)? = null

        fun show(
            fm: FragmentManager,
            store: StoreEntity,
            regionName: String?,
            onAction: ((StoreEntity, Int) -> Unit)? = null,
            visits: List<VisitEntity> = emptyList()
        ) {
            pendingStore = store
            pendingVisits = visits
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
        val dial = {
            if (!phone.isNullOrBlank()) {
                try {
                    startActivity(Intent(Intent.ACTION_DIAL, Uri.parse("tel:${phone.trim()}")))
                } catch (e: ActivityNotFoundException) {
                    // لا يوجد تطبيق اتصال على الجهاز
                }
            }
        }
        binding.callButton.setOnClickListener { dial() }
        binding.rowPhone.setOnClickListener { dial() }

        val region = args.getString(ARG_REGION)
        binding.regionValue.text = region ?: getString(R.string.no_region)

        // بقية الحقول من الكيان مباشرة — يظهر كل صف فقط إن وُجدت قيمته
        val store2 = pendingStore
        fun bindRow(row: View, valueView: android.widget.TextView, value: String?) {
            if (value.isNullOrBlank()) {
                row.visibility = View.GONE
            } else {
                valueView.text = value
            }
        }
        if (store2?.code != null) {
            binding.codeValue.text = store2.code.toString()
        } else {
            binding.rowCode.visibility = View.GONE
        }
        bindRow(binding.rowAccountType, binding.accountTypeValue, store2?.accountType)
        bindRow(binding.rowStatus, binding.statusValue, store2?.status)
        bindRow(binding.rowCategory, binding.categoryValue, store2?.category)
        bindRow(binding.rowShopClass, binding.shopClassValue, store2?.shopClass)
        bindRow(binding.rowManager, binding.managerValue, store2?.managerName)
        bindRow(binding.rowGovernate, binding.governateValue, store2?.governate)
        bindRow(binding.rowAddress, binding.addressValue, store2?.address)

        val whatsapp = store2?.whatsapp
        bindRow(binding.rowWhatsapp, binding.whatsappValue, whatsapp)
        binding.rowWhatsapp.setOnClickListener {
            val digits = whatsappToInternational(whatsapp)
            if (digits.isNotEmpty()) {
                try {
                    startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://wa.me/$digits")))
                } catch (e: ActivityNotFoundException) {
                    // لا يوجد متصفح/واتساب على الجهاز
                }
            }
        }

        buildVisitsRows(binding, pendingVisits)

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

    /** أرقام فقط؛ الرقم المحلي الذي يبدأ بـ 0 يُحوَّل إلى الصيغة الدولية بمفتاح سوريا 963 */
    private fun whatsappToInternational(raw: String?): String {
        var digits = raw.orEmpty().filter { it.isDigit() }
        if (digits.startsWith("0")) digits = "963" + digits.drop(1)
        return digits
    }

    /** سطر لكل زيارة: المندوب — نوع الفاتورة — يوم الزيارة (تُتخطى الأجزاء الفارغة) */
    private fun buildVisitsRows(binding: DialogStoreBinding, visits: List<VisitEntity>) {
        val ctx = requireContext()
        val density = resources.displayMetrics.density
        var added = 0
        for (visit in visits) {
            val parts = listOfNotNull(
                visit.repName?.takeIf { it.isNotBlank() },
                visit.invoiceType?.takeIf { it.isNotBlank() },
                visit.visitDay?.takeIf { it.isNotBlank() }
            )
            if (parts.isEmpty()) continue
            val row = android.widget.TextView(ctx).apply {
                text = parts.joinToString(" — ")
                textSize = 14f
                setPaddingRelative((12 * density).toInt(), (2 * density).toInt(), 0, (2 * density).toInt())
            }
            binding.visitsContainer.addView(row)
            added++
        }
        if (added == 0) {
            val empty = android.widget.TextView(ctx).apply {
                text = getString(R.string.no_visits)
                textSize = 14f
                setPaddingRelative((12 * density).toInt(), (2 * density).toInt(), 0, (2 * density).toInt())
            }
            binding.visitsContainer.addView(empty)
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        pendingStore = null
        pendingVisits = emptyList()
        pendingAction = null
    }
}
