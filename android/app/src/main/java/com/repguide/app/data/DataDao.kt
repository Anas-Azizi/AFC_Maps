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

    @Query("SELECT * FROM polygons ORDER BY name")
    suspend fun allPolygons(): List<PolygonEntity>

    @Query("SELECT * FROM stores ORDER BY name")
    suspend fun allStores(): List<StoreEntity>

    @Query("SELECT * FROM landmarks ORDER BY name")
    suspend fun allLandmarks(): List<LandmarkEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertRegions(regions: List<RegionEntity>)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertPolygons(polygons: List<PolygonEntity>)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertStores(stores: List<StoreEntity>)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertLandmarks(landmarks: List<LandmarkEntity>)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertVisits(visits: List<VisitEntity>)

    @Query("SELECT * FROM visits WHERE storeId = :storeId")
    suspend fun visitsForStore(storeId: Int): List<VisitEntity>

    /** معرفات المحلات التي لها زيارة واحدة على الأقل من أحد المناديب المعطاة */
    @Query("SELECT DISTINCT storeId FROM visits WHERE repName IN (:reps)")
    suspend fun storeIdsForReps(reps: List<String>): List<Int>

    /** معرفات المحلات التي لها زيارة واحدة على الأقل في أحد الأيام المعطاة */
    @Query("SELECT DISTINCT storeId FROM visits WHERE visitDay IN (:days)")
    suspend fun storeIdsForDays(days: List<String>): List<Int>

    /** معرفات المحلات التي لها زيارة واحدة على الأقل لأحد المناديب في أحد الأيام (نفس الزيارة) */
    @Query("SELECT DISTINCT storeId FROM visits WHERE repName IN (:reps) AND visitDay IN (:days)")
    suspend fun storeIdsForRepsAndDays(reps: List<String>, days: List<String>): List<Int>

    @Query("SELECT DISTINCT repName FROM visits WHERE repName IS NOT NULL AND repName != '' ORDER BY repName")
    suspend fun allRepNames(): List<String>

    @Query("SELECT DISTINCT visitDay FROM visits WHERE visitDay IS NOT NULL AND visitDay != '' ORDER BY visitDay")
    suspend fun allVisitDays(): List<String>

    @Query("DELETE FROM stores")
    suspend fun clearStores()

    @Query("DELETE FROM regions")
    suspend fun clearRegions()

    @Query("DELETE FROM polygons")
    suspend fun clearPolygons()

    @Query("DELETE FROM landmarks")
    suspend fun clearLandmarks()

    @Query("DELETE FROM visits")
    suspend fun clearVisits()

    @Transaction
    suspend fun replaceAll(
        regions: List<RegionEntity>,
        polygons: List<PolygonEntity>,
        stores: List<StoreEntity>,
        landmarks: List<LandmarkEntity>,
        visits: List<VisitEntity>
    ) {
        clearStores()
        clearRegions()
        clearPolygons()
        clearLandmarks()
        clearVisits()
        insertRegions(regions)
        insertPolygons(polygons)
        insertStores(stores)
        insertLandmarks(landmarks)
        insertVisits(visits)
    }

    @Transaction
    suspend fun clearAll() {
        clearStores()
        clearRegions()
        clearPolygons()
        clearLandmarks()
        clearVisits()
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
