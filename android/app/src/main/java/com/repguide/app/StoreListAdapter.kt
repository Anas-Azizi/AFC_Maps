package com.repguide.app

import android.view.LayoutInflater
import android.view.ViewGroup
import androidx.recyclerview.widget.RecyclerView
import com.repguide.app.data.StoreEntity
import com.repguide.app.databinding.ItemStoreSuggestionBinding

data class StoreListItem(val store: StoreEntity, val subtitle: String)

class StoreListAdapter(
    private val onClick: (StoreEntity) -> Unit
) : RecyclerView.Adapter<StoreListAdapter.VH>() {

    private var items: List<StoreListItem> = emptyList()

    fun submitList(newItems: List<StoreListItem>) {
        items = newItems
        notifyDataSetChanged()
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH {
        val binding = ItemStoreSuggestionBinding.inflate(
            LayoutInflater.from(parent.context), parent, false
        )
        return VH(binding)
    }

    override fun onBindViewHolder(holder: VH, position: Int) {
        val item = items[position]
        holder.binding.storeNameText.text = item.store.name
        holder.binding.storeSubText.text = item.subtitle
        holder.binding.root.setOnClickListener { onClick(item.store) }
    }

    override fun getItemCount() = items.size

    class VH(val binding: ItemStoreSuggestionBinding) : RecyclerView.ViewHolder(binding.root)
}
