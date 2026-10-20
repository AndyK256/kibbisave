package com.kibbisave.app

import org.junit.Assert.*
import org.junit.Test

class DomainTest {
    private val now = 1_800_000_000_000L

    @Test fun `user may read a fresh saved balance during a valid session`() {
        assertTrue(OfflinePolicy.mayRead("/api/home", false, now - 1000, now + 1000, now))
    }

    @Test fun `balance is unavailable after session expiry even if snapshot is fresh`() {
        assertFalse(OfflinePolicy.mayRead("/api/home", false, now - 1000, now, now))
    }

    @Test fun `snapshots expire after 24 hours`() {
        assertFalse(OfflinePolicy.mayRead("/api/profile/history", false,
            now - OfflinePolicy.MAX_AGE_MS - 1, now + 1000, now))
        assertTrue(OfflinePolicy.mayRead("/api/profile/history", false,
            now - OfflinePolicy.MAX_AGE_MS, now + 1000, now))
    }

    @Test fun `moving device clock backwards does not unlock future snapshots`() {
        assertFalse(OfflinePolicy.mayRead("/api/groups/mine", false, now + 1000, now + 2000, now))
    }

    @Test fun `admin data and pending financial actions are not stored offline`() {
        for (path in listOf("/api/admin/home", "/api/admin/approvals", "/api/admin/transactions", "/api/home")) {
            assertFalse(OfflinePolicy.maySave(path, true))
        }
        for (path in listOf("/api/deposits", "/api/auth/me", "/api/profile", "/api/admin/approvals")) {
            assertFalse(OfflinePolicy.maySave(path, false))
        }
    }

    @Test fun `amount validation rejects zero negative fractional malformed and overflowing values`() {
        for (amount in listOf("0", "-1", "10.5", "", "not money", "99999999999999999999999", "1000000000001")) {
            assertNull(amount, Money.positiveUgx(amount))
        }
        assertEquals(12000L, Money.positiveUgx(" 12000 "))
        assertEquals(1L, Money.positiveUgx("1"))
        assertEquals(1_000_000_000_000L, Money.positiveUgx("1000000000000"))
    }

    @Test fun `API paths remain on the configured HTTPS origin`() {
        val uri = ApiAddress.resolve("https://kibbisave.com", "/api/admin/approvals")
        assertEquals("https", uri.scheme)
        assertEquals("kibbisave.com", uri.host)
        assertEquals("/api/admin/approvals", uri.path)
    }

    @Test fun `API addressing rejects cross origin paths and unsafe origins`() {
        for (path in listOf("https://evil.example/api/me", "//evil.example/api/me", "/api/../../secret", "/api/%2e%2e/private", "/login", "/api/me#token")) {
            assertThrows(IllegalArgumentException::class.java) { ApiAddress.resolve("https://kibbisave.com", path) }
        }
        for (origin in listOf("http://kibbisave.com", "https://name:secret@kibbisave.com", "https://kibbisave.com:8443", "https://kibbisave.com/path")) {
            assertThrows(IllegalArgumentException::class.java) { ApiAddress.resolve(origin, "/api/home") }
        }
    }
}
