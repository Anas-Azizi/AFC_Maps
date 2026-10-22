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
    val b1Rep: String?,
    val b1Channel: String?,
    val b1Day: String?,
    val b2Rep: String?,
    val b2Channel: String?,
    val b2Day: String?,
    val b3Rep: String?,
    val b3Channel: String?,
    val b3Day: String?
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
    val createdAt: Long
)
