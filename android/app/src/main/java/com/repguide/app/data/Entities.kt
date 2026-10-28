package com.repguide.app.data

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "regions")
data class RegionEntity(
    @PrimaryKey val id: Int,
    val name: String,
    val color: String?,
    val polygonJson: String?,
    val labelLat: Double?,
    val labelLng: Double?
)

@Entity(tableName = "stores")
data class StoreEntity(
    @PrimaryKey val id: Int,
    val name: String,
    val ownerName: String?,
    val phone: String?,
    val lat: Double?,
    val lng: Double?,
    val regionId: Int?,
    val notes: String?,
    val code: Int?,
    val address: String?,
    val whatsapp: String?,
    val accountType: String?,
    val status: String?,
    val category: String?,
    val shopClass: String?,
    val managerName: String?,
    val governate: String?
)

@Entity(tableName = "visits")
data class VisitEntity(
    @PrimaryKey(autoGenerate = true) val id: Int = 0,
    val storeId: Int,
    val repName: String?,
    val invoiceType: String?,
    val visitDay: String?
)

@Entity(tableName = "landmarks")
data class LandmarkEntity(
    @PrimaryKey val id: Int,
    val name: String,
    val lat: Double,
    val lng: Double
)

@Entity(tableName = "pending_submissions")
data class PendingSubmissionEntity(
    @PrimaryKey(autoGenerate = true) val id: Int = 0,
    val name: String,
    val lat: Double,
    val lng: Double,
    val createdAt: Long
)

@Entity(tableName = "pending_updates")
data class PendingUpdateEntity(
    @PrimaryKey(autoGenerate = true) val id: Int = 0,
    val storeId: Int?,
    val storeName: String,
    val lat: Double?,
    val lng: Double?,
    val note: String?,
    val newName: String? = null,
    val cancel: Boolean = false,
    val createdAt: Long
)
