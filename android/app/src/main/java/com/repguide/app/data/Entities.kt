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
    val lat: Double,
    val lng: Double,
    val regionId: Int?,
    val notes: String?
)

@Entity(tableName = "pending_submissions")
data class PendingSubmissionEntity(
    @PrimaryKey(autoGenerate = true) val id: Int = 0,
    val name: String,
    val lat: Double,
    val lng: Double,
    val createdAt: Long
)
