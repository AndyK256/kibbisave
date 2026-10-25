package com.kibbisave.app

import java.security.cert.CertificateException
import java.security.cert.X509Certificate
import javax.net.ssl.X509TrustManager
import org.junit.Assert.*
import org.junit.Test

class WebsiteTlsTest {
    private class Trust(private val accepts: Boolean) : X509TrustManager {
        var serverCalls = 0
        var clientCalls = 0

        override fun checkServerTrusted(chain: Array<X509Certificate>, authType: String) {
            serverCalls++
            if (!accepts) throw CertificateException("Untrusted chain")
        }

        override fun checkClientTrusted(chain: Array<X509Certificate>, authType: String) {
            clientCalls++
            if (!accepts) throw CertificateException("Untrusted client")
        }

        override fun getAcceptedIssuers() = emptyArray<X509Certificate>()
    }

    @Test
    fun systemTrustRemainsPreferred() {
        val system = Trust(true)
        val root = Trust(false)
        RootFallbackTrust(system, root).checkServerTrusted(emptyArray(), "RSA")
        assertEquals(1, system.serverCalls)
        assertEquals(0, root.serverCalls)
    }

    @Test
    fun legacyDeviceRequiresOfficialRootValidation() {
        val system = Trust(false)
        val root = Trust(true)
        RootFallbackTrust(system, root).checkServerTrusted(emptyArray(), "RSA")
        assertEquals(1, system.serverCalls)
        assertEquals(1, root.serverCalls)
    }

    @Test
    fun untrustedServerStillFailsClosed() {
        val root = Trust(false)
        try {
            RootFallbackTrust(Trust(false), root).checkServerTrusted(emptyArray(), "RSA")
            fail("An untrusted server must be rejected")
        } catch (expected: CertificateException) {
            assertEquals(1, expected.suppressed.size)
        }
        assertEquals(1, root.serverCalls)
    }

    @Test
    fun fallbackDoesNotExpandClientTrust() {
        val system = Trust(false)
        val root = Trust(true)
        try {
            RootFallbackTrust(system, root).checkClientTrusted(emptyArray(), "RSA")
            fail("Client trust must remain delegated to the system")
        } catch (_: CertificateException) {}
        assertEquals(1, system.clientCalls)
        assertEquals(0, root.clientCalls)
    }
}
