package com.repguide.app.data

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

val MIGRATION_1_2 = object : Migration(1, 2) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL(
            """CREATE TABLE IF NOT EXISTS pending_submissions (
                id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
                name TEXT NOT NULL,
                lat REAL NOT NULL,
                lng REAL NOT NULL,
                createdAt INTEGER NOT NULL
            )"""
        )
    }
}

val MIGRATION_2_3 = object : Migration(2, 3) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL(
            """CREATE TABLE IF NOT EXISTS pending_updates (
                id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
                storeId INTEGER,
                storeName TEXT NOT NULL,
                lat REAL,
                lng REAL,
                note TEXT,
                createdAt INTEGER NOT NULL
            )"""
        )
    }
}

val MIGRATION_3_4 = object : Migration(3, 4) {
    override fun migrate(db: SupportSQLiteDatabase) {
        // إعادة بناء stores: lat/lng nullable + أعمدة الكود والعنوان والسلات
        db.execSQL(
            """CREATE TABLE stores_new (
                id INTEGER PRIMARY KEY NOT NULL,
                name TEXT NOT NULL,
                ownerName TEXT,
                phone TEXT,
                lat REAL,
                lng REAL,
                regionId INTEGER,
                notes TEXT,
                code INTEGER,
                address TEXT,
                b1Rep TEXT, b1Channel TEXT, b1Day TEXT,
                b2Rep TEXT, b2Channel TEXT, b2Day TEXT,
                b3Rep TEXT, b3Channel TEXT, b3Day TEXT
            )"""
        )
        db.execSQL(
            """INSERT INTO stores_new (id, name, ownerName, phone, lat, lng, regionId, notes)
               SELECT id, name, ownerName, phone, lat, lng, regionId, notes FROM stores"""
        )
        db.execSQL("DROP TABLE stores")
        db.execSQL("ALTER TABLE stores_new RENAME TO stores")
        db.execSQL(
            """CREATE TABLE IF NOT EXISTS landmarks (
                id INTEGER PRIMARY KEY NOT NULL,
                name TEXT NOT NULL,
                lat REAL NOT NULL,
                lng REAL NOT NULL
            )"""
        )
    }
}

@Database(
    entities = [RegionEntity::class, StoreEntity::class, PendingSubmissionEntity::class, PendingUpdateEntity::class, LandmarkEntity::class],
    version = 4,
    exportSchema = false
)
abstract class AppDatabase : RoomDatabase() {
    abstract fun dataDao(): DataDao

    companion object {
        @Volatile
        private var instance: AppDatabase? = null

        fun get(ctx: Context): AppDatabase =
            instance ?: synchronized(this) {
                instance ?: Room.databaseBuilder(
                    ctx.applicationContext,
                    AppDatabase::class.java,
                    "rep_guide.db"
                ).addMigrations(MIGRATION_1_2, MIGRATION_2_3, MIGRATION_3_4).build().also { instance = it }
            }
    }
}
