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

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertRegions(regions: List<RegionEntity>)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertStores(stores: List<StoreEntity>)

    @Query("DELETE FROM stores")
    suspend fun clearStores()

    @Query("DELETE FROM regions")
    suspend fun clearRegions()

    @Transaction
    suspend fun replaceAll(regions: List<RegionEntity>, stores: List<StoreEntity>) {
        clearStores()
        clearRegions()
        insertRegions(regions)
        insertStores(stores)
    }

    @Transaction
    suspend fun clearAll() {
        clearStores()
        clearRegions()
    }
}
