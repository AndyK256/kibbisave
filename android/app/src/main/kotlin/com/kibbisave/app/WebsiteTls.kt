package com.kibbisave.app

import java.io.InputStream
import java.security.KeyStore
import java.security.cert.CertificateException
import java.security.cert.CertificateFactory
import java.security.cert.X509Certificate
import javax.net.ssl.SSLContext
import javax.net.ssl.SSLSocketFactory
import javax.net.ssl.TrustManagerFactory
import javax.net.ssl.X509TrustManager

/** Android 6/7 predate ISRG Root X1. Retains normal chain validation and hostname verification. */
object WebsiteTls {
    fun factory(rootCertificate: InputStream): SSLSocketFactory {
        val normal = manager(null)
        val roots = KeyStore.getInstance(KeyStore.getDefaultType()).apply { load(null) }
        val root = CertificateFactory.getInstance("X.509").generateCertificate(rootCertificate)
        roots.setCertificateEntry("isrg-root-x1", root)
        val combined = RootFallbackTrust(normal, manager(roots))
        return SSLContext.getInstance("TLS")
            .apply { init(null, arrayOf(combined), null) }
            .socketFactory
    }

    private fun manager(store: KeyStore?): X509TrustManager =
        TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm())
            .apply { init(store) }
            .trustManagers
            .filterIsInstance<X509TrustManager>()
            .single()
}

internal class RootFallbackTrust(
    private val system: X509TrustManager,
    private val officialRoot: X509TrustManager,
) : X509TrustManager {
    override fun checkServerTrusted(chain: Array<X509Certificate>, authType: String) {
        try {
            system.checkServerTrusted(chain, authType)
        } catch (systemFailure: CertificateException) {
            try {
                officialRoot.checkServerTrusted(chain, authType)
            } catch (rootFailure: CertificateException) {
                rootFailure.addSuppressed(systemFailure)
                throw rootFailure
            }
        }
    }

    override fun checkClientTrusted(chain: Array<X509Certificate>, authType: String) =
        system.checkClientTrusted(chain, authType)

    override fun getAcceptedIssuers(): Array<X509Certificate> =
        system.acceptedIssuers + officialRoot.acceptedIssuers
}
