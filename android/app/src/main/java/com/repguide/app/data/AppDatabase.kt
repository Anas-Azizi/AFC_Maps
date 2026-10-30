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

val MIGRATION_4_5 = object : Migration(4, 5) {
    override fun migrate(db: SupportSQLiteDatabase) {
        // إعادة بناء stores: إسقاط أعمدة السلات وإضافة الحقول الجديدة + جدول الزيارات
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
                whatsapp TEXT,
                accountType TEXT,
                status TEXT,
                category TEXT,
                shopClass TEXT,
                managerName TEXT,
                governate TEXT
            )"""
        )
        db.execSQL(
            """INSERT INTO stores_new (id, name, ownerName, phone, lat, lng, regionId, notes, code, address)
               SELECT id, name, ownerName, phone, lat, lng, regionId, notes, code, address FROM stores"""
        )
        db.execSQL("DROP TABLE stores")
        db.execSQL("ALTER TABLE stores_new RENAME TO stores")
        db.execSQL(
            """CREATE TABLE IF NOT EXISTS visits (
                id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
                storeId INTEGER NOT NULL,
                repName TEXT,
                invoiceType TEXT,
                visitDay TEXT
            )"""
        )
    }
}

val MIGRATION_5_6 = object : Migration(5, 6) {
    override fun migrate(db: SupportSQLiteDatabase) {
        // حقلا إعادة التسمية والإلغاء النهائي في التحديثات المعلّقة
        db.execSQL("ALTER TABLE pending_updates ADD COLUMN newName TEXT")
        db.execSQL("ALTER TABLE pending_updates ADD COLUMN cancel INTEGER NOT NULL DEFAULT 0")
    }
}

val MIGRATION_6_7 = object : Migration(6, 7) {
    override fun migrate(db: SupportSQLiteDatabase) {
        // فصل المناطق (أسماء فقط للفلترة) عن المضلعات (رسم مرئي فقط)
        // لا DROP COLUMN في SQLite القديم — إعادة بناء الجدول
        db.execSQL("ALTER TABLE regions RENAME TO regions_old")
        db.execSQL(
            """CREATE TABLE regions (
                id INTEGER PRIMARY KEY NOT NULL,
                name TEXT NOT NULL
            )"""
        )
        db.execSQL("INSERT INTO regions (id, name) SELECT id, name FROM regions_old")
        db.execSQL("DROP TABLE regions_old")
        db.execSQL(
            """CREATE TABLE IF NOT EXISTS polygons (
                id INTEGER PRIMARY KEY NOT NULL,
                name TEXT NOT NULL,
                color TEXT,
                polygonJson TEXT,
                labelLat REAL,
                labelLng REAL
            )"""
        )
    }
}

@Database(
    entities = [RegionEntity::class, StoreEntity::class, PendingSubmissionEntity::class, PendingUpdateEntity::class, LandmarkEntity::class, VisitEntity::class, PolygonEntity::class],
    version = 7,
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
                ).addMigrations(MIGRATION_1_2, MIGRATION_2_3, MIGRATION_3_4, MIGRATION_4_5, MIGRATION_5_6, MIGRATION_6_7).build().also { instance = it }
            }
    }
}
