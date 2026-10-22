package com.repguide.app.data

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Transaction

@Dao
interface DataDao {
    @Query("SELECT COUNT(*) FROM stores")
    suspend fun storeCount(): Int

    @Query("SELECT * FROM regions ORDER BY name")
    suspend fun allRegions(): List<RegionEntity>

    @Query("SELECT * FROM stores ORDER BY name")
    suspend fun allStores(): List<StoreEntity>

    @Query("SELECT * FROM landmarks ORDER BY name")
    suspend fun allLandmarks(): List<LandmarkEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertRegions(regions: List<RegionEntity>)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertStores(stores: List<StoreEntity>)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertLandmarks(landmarks: List<LandmarkEntity>)

    @Query("DELETE FROM stores")
    suspend fun clearStores()

    @Query("DELETE FROM regions")
    suspend fun clearRegions()

    @Query("DELETE FROM landmarks")
    suspend fun clearLandmarks()

    @Transaction
    suspend fun replaceAll(regions: List<RegionEntity>, stores: List<StoreEntity>, landmarks: List<LandmarkEntity>) {
        clearStores()
        clearRegions()
        clearLandmarks()
        insertRegions(regions)
        insertStores(stores)
        insertLandmarks(landmarks)
    }

    @Transaction
    suspend fun clearAll() {
        clearStores()
        clearRegions()
        clearLandmarks()
    }

    @Insert
    suspend fun insertPendingSubmission(submission: PendingSubmissionEntity)

    @Query("SELECT * FROM pending_submissions ORDER BY createdAt")
    suspend fun pendingSubmissions(): List<PendingSubmissionEntity>

    @Query("DELETE FROM pending_submissions WHERE id = :id")
    suspend fun deletePendingSubmission(id: Int)

    @Insert
    suspend fun insertPendingUpdate(update: PendingUpdateEntity)

    @Query("SELECT * FROM pending_updates ORDER BY createdAt")
    suspend fun pendingUpdates(): List<PendingUpdateEntity>

    @Query("DELETE FROM pending_updates WHERE id = :id")
    suspend fun deletePendingUpdate(id: Int)
}
