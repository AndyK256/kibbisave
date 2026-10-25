package com.kibbisave.app

import android.app.AlertDialog
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.text.InputType
import android.text.method.PasswordTransformationMethod
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.*
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.credentials.CredentialManager
import androidx.credentials.CredentialManagerCallback
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.GetCredentialResponse
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialException
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import java.io.IOException
import java.text.DateFormat
import java.text.NumberFormat
import java.util.Date
import java.util.Locale
import java.util.concurrent.Executor
import org.json.JSONArray
import org.json.JSONObject

/** Native Android screens modelled on the deployed website. No WebView or embedded website. */
class MainActivity : ComponentActivity() {
    private val app
        get() = application as NativeApplication

    private val store
        get() = app.store

    private val repository
        get() = app.repository

    private val main = Handler(Looper.getMainLooper())
    private val navy = Color.rgb(0, 0, 139)
    private val accent
        get() = navy

    private val appearance by lazy { getSharedPreferences("appearance", MODE_PRIVATE) }
    private var dark = false
    private val muted
        get() = if (dark) Color.rgb(176, 168, 157) else Color.rgb(122, 133, 160)

    private val ink
        get() = if (dark) Color.rgb(245, 240, 232) else navy

    private val paper
        get() = if (dark) Color.rgb(18, 18, 22) else Color.WHITE

    private val canvasColor
        get() = if (dark) Color.rgb(6, 6, 9) else Color.rgb(244, 246, 251)

    private val lineColor
        get() = if (dark) Color.rgb(51, 49, 55) else Color.rgb(221, 227, 240)

    private val font by lazy {
        try {
            Typeface.createFromAsset(assets, "fonts/DMSans.ttf")
        } catch (_: Exception) {
            Typeface.create("sans-serif", Typeface.NORMAL)
        }
    }
    private lateinit var root: LinearLayout
    private lateinit var content: LinearLayout
    private lateinit var connectionLabel: TextView
    private lateinit var connectivity: ConnectivityManager
    private var generation = 0
    private var tab = if (BuildConfig.ADMIN_APP) "Home" else "Analytics"
    private var lastSnapshotOffline = false
    private var authPage = false
    private var subpage = false
    private var privateGroups = false
    private var communityFilter = "All"
    private var photoResult: ((String) -> Unit)? = null
    private val photoPicker =
        registerForActivityResult(ActivityResultContracts.GetContent()) { uri ->
            if (uri != null)
                task(
                    {
                        contentResolver.openInputStream(uri)?.use { stream ->
                            val bytes = stream.readBytes()
                            require(bytes.size <= 8 * 1024 * 1024) { "Choose a photo under 8 MB." }
                            val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                            BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
                            require(bounds.outWidth > 0 && bounds.outHeight > 0) {
                                "Choose a valid image."
                            }
                            var sample = 1
                            while (
                                maxOf(bounds.outWidth, bounds.outHeight) / sample > 1800
                            ) sample *= 2
                            val bitmap =
                                BitmapFactory.decodeByteArray(
                                    bytes,
                                    0,
                                    bytes.size,
                                    BitmapFactory.Options().apply { inSampleSize = sample },
                                ) ?: error("Choose a valid image.")
                            encodePhoto(bitmap)
                        } ?: error("Could not open photo.")
                    },
                    {
                        photoResult?.invoke(it)
                        photoResult = null
                    },
                )
        }
    private val camera =
        registerForActivityResult(ActivityResultContracts.TakePicturePreview()) { bitmap ->
            if (bitmap != null) photoResult?.invoke(encodePhoto(bitmap))
            photoResult = null
        }
    private val networkCallback =
        object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) = refreshConnection()

            override fun onLost(network: Network) = refreshConnection()

            override fun onCapabilitiesChanged(
                network: Network,
                capabilities: NetworkCapabilities,
            ) = refreshConnection()
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        dark = appearance.getBoolean("dark", false)
        window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
        window.statusBarColor = navy
        window.navigationBarColor = navy
        connectivity = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        connectivity.registerNetworkCallback(
            NetworkRequest.Builder()
                .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                .build(),
            networkCallback,
        )
        onBackPressedDispatcher.addCallback(
            this,
            object : OnBackPressedCallback(true) {
                override fun handleOnBackPressed() {
                    goBack()
                }
            },
        )
        navigate(savedInstanceState?.getString("tab") ?: tab)
    }

    override fun onSaveInstanceState(outState: Bundle) {
        outState.putString("tab", tab)
        super.onSaveInstanceState(outState)
    }

    override fun onDestroy() {
        generation++
        connectivity.unregisterNetworkCallback(networkCallback)
        super.onDestroy()
    }

    private fun goBack() {
        if (authPage || subpage) {
            navigate(tab)
        } else if (tab != if (BuildConfig.ADMIN_APP) "Home" else "Analytics") {
            navigate(if (BuildConfig.ADMIN_APP) "Home" else "Analytics")
        } else finish()
    }

    private fun online() =
        connectivity.activeNetwork?.let {
            connectivity
                .getNetworkCapabilities(it)
                ?.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
        } == true

    private fun refreshConnection() {
        main.post {
            if (!isDestroyed && ::connectionLabel.isInitialized) {
                connectionLabel.text =
                    if (!online()) "Offline · saved data only"
                    else if (lastSnapshotOffline) "Saved data · refresh when online" else ""
                connectionLabel.visibility =
                    if (connectionLabel.text.isEmpty()) View.GONE else View.VISIBLE
            }
        }
    }

    private fun navigate(destination: String) {
        authPage = false
        subpage = false
        tab =
            when (destination) {
                "Account" -> "Profile"
                "Home" -> if (BuildConfig.ADMIN_APP) "Home" else "Analytics"
                else -> destination
            }
        when (tab) {
            "Profile" -> account()
            "Leaderboard" -> leaderboard()
            "Groups" -> groups()
            "Communities" -> communities()
            "Approvals" -> approvals()
            "Register" -> registerMember()
            "History" -> history()
            else -> home()
        }
    }

    private fun screen(title: String, signedIn: Boolean = store.session() != null) {
        generation++
        lastSnapshotOffline = false
        authPage = title == "__auth"
        root =
            LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                setBackgroundColor(if (authPage) navy else canvasColor)
                setOnApplyWindowInsetsListener { view, insets ->
                    view.setPadding(
                        insets.systemWindowInsetLeft,
                        insets.systemWindowInsetTop,
                        insets.systemWindowInsetRight,
                        insets.systemWindowInsetBottom,
                    )
                    insets
                }
            }
        val profileSheet = !BuildConfig.ADMIN_APP && tab == "Profile" && !authPage
        window.statusBarColor = if (profileSheet) canvasColor else navy
        window.decorView.systemUiVisibility =
            if (profileSheet && !dark) View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR else 0
        if ((!BuildConfig.ADMIN_APP || authPage) && !profileSheet) {
            val header =
                LinearLayout(this).apply {
                    gravity = Gravity.CENTER_VERTICAL
                    setPadding(dp(20), 0, dp(20), 0)
                    setBackgroundColor(navy)
                }
            val brand =
                TextView(this).apply {
                    text = "Kibbisave"
                    gravity = Gravity.CENTER_VERTICAL
                    includeFontPadding = false
                    textSize = 21.6f
                    typeface = Typeface.create(font, Typeface.BOLD)
                    setTextColor(Color.WHITE)
                    setOnClickListener {
                        navigate(if (BuildConfig.ADMIN_APP) "Home" else "Analytics")
                    }
                }
            if (authPage) {
                header.addView(
                    ImageView(this).apply {
                        setImageDrawable(
                            android.graphics.drawable.Drawable.createFromStream(
                                assets.open("illustrations/kibbisave-logo-white.png"),
                                null,
                            )
                        )
                        importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
                    },
                    LinearLayout.LayoutParams(dp(27), dp(27)).apply { marginEnd = dp(6) },
                )
            }
            header.addView(brand, LinearLayout.LayoutParams(0, dp(if (authPage) 60 else 64), 1f))
            if (!authPage) {
                if (store.session() == null) {
                    headerText(header, "JOIN NOW", true) { registration() }
                    headerText(header, "LOGIN", false) { loginScreen() }
                } else headerText(header, "+ DEPOSIT", true) { selectDepositGroup() }
                iconButton(header, "search", Color.WHITE) { searchScreen() }
            }
            root.addView(header)
        }
        if (profileSheet) {
            val closeBar =
                LinearLayout(this).apply {
                    gravity = Gravity.END
                    setPadding(dp(12), dp(12), dp(12), 0)
                }
            val close =
                TextView(this).apply {
                    text = "×"
                    textSize = 26f
                    setTextColor(ink)
                    gravity = Gravity.CENTER
                    contentDescription = "Close account menu"
                    setOnClickListener {
                        if (subpage) navigate("Profile") else navigate("Analytics")
                    }
                }
            closeBar.addView(close, LinearLayout.LayoutParams(dp(40), dp(40)))
            root.addView(closeBar)
        }
        connectionLabel =
            TextView(this).apply {
                textSize = 12f
                setTextColor(if (authPage) Color.WHITE else ink)
                setPadding(dp(16), dp(5), dp(16), dp(5))
            }
        root.addView(connectionLabel)
        refreshConnection()
        val scroll =
            ScrollView(this).apply {
                isFillViewport = true
                clipToPadding = false
            }
        content =
            LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                setPadding(
                    dp(if (profileSheet) 12 else if (authPage) 16 else 20),
                    dp(if (authPage || profileSheet) 0 else 20),
                    dp(if (profileSheet) 12 else if (authPage) 16 else 20),
                    dp(24),
                )
            }
        scroll.addView(content)
        root.addView(scroll, LinearLayout.LayoutParams(-1, 0, 1f))
        if (title.isNotBlank() && !authPage) label(content, title, 24, true)
        if (!authPage && !profileSheet) bottomNavigation()
        setContentView(root)
    }

    private fun bottomNavigation() {
        val dock =
            LinearLayout(this).apply {
                gravity = Gravity.TOP
                setPadding(0, 0, 0, dp(8))
                setBackgroundColor(
                    if (BuildConfig.ADMIN_APP) paper else if (dark) Color.BLACK else navy
                )
                elevation = dp(12).toFloat()
            }
        val tabs =
            if (BuildConfig.ADMIN_APP)
                listOf("Profile", "Communities", "Home", "Approvals", "Register")
            else listOf("Profile", "Leaderboard", "Analytics", "Groups", "Communities")
        for (name in tabs) {
            val active = tab == name
            val tint =
                if (BuildConfig.ADMIN_APP && !active) muted
                else if (dark) {
                    if (active) ink else muted
                } else if (active) Color.WHITE else Color.argb(199, 255, 255, 255)
            val item =
                LinearLayout(this).apply {
                    orientation = LinearLayout.VERTICAL
                    gravity = Gravity.CENTER
                    contentDescription = name
                    isClickable = true
                    isFocusable = true
                    setOnClickListener { navigate(name) }
                    if (active)
                        background =
                            if (BuildConfig.ADMIN_APP) round(navy, 18)
                            else
                                WebsiteSurface(
                                    resources.displayMetrics.density,
                                    if (dark) WebsiteSurface.Kind.DARK_NAV
                                    else WebsiteSurface.Kind.NAV,
                                )
                }
            item.addView(
                BrandIcon(
                    this,
                    when (name) {
                        "Register" -> "plus"
                        "Approvals" -> "check"
                        else -> name.lowercase()
                    },
                    tint,
                ),
                LinearLayout.LayoutParams(dp(21), dp(21)),
            )
            val text =
                TextView(this).apply {
                    this.text = if (name == "Home") "Home" else name
                    textSize = 8.8f
                    typeface = font
                    gravity = Gravity.CENTER
                    setTextColor(tint)
                    setPadding(0, dp(2), 0, 0)
                }
            item.addView(text)
            dock.addView(
                item,
                LinearLayout.LayoutParams(0, dp(58), 1f),
            )
        }
        root.addView(dock)
    }

    private fun headerText(
        parent: LinearLayout,
        title: String,
        filled: Boolean,
        click: () -> Unit,
    ) {
        val v =
            TextView(this).apply {
                text = title
                textSize = 11.2f
                typeface = Typeface.create(font, Typeface.BOLD)
                gravity = Gravity.CENTER
                setTextColor(if (filled) navy else Color.WHITE)
                background =
                    round(
                        if (filled) Color.WHITE else navy,
                        4,
                        if (filled) Color.WHITE else Color.rgb(150, 150, 211),
                    )
                setPadding(dp(10), 0, dp(10), 0)
                setOnClickListener { click() }
            }
        parent.addView(v, LinearLayout.LayoutParams(-2, dp(32)).apply { marginEnd = dp(6) })
    }

    private fun iconButton(
        parent: LinearLayout,
        name: String,
        tint: Int = ink,
        click: () -> Unit,
    ): View {
        val v =
            BrandIcon(this, name, tint).apply {
                setPadding(dp(8), dp(8), dp(8), dp(8))
                contentDescription = name
                isFocusable = true
                setOnClickListener { click() }
            }
        parent.addView(v, LinearLayout.LayoutParams(dp(38), dp(38)))
        return v
    }

    private fun requireLogin(action: () -> Unit) {
        if (store.session() == null) loginScreen("Log in to continue.") else action()
    }

    private fun loginScreen(message: String? = null) {
        screen("__auth", false)
        val panel = authPanel(false)
        if (message != null) label(panel, message, 14).setTextColor(Color.WHITE)
        val identifier = phoneField(panel, "Mobile Number or Email", "7XXXXXXXX or email")
        authHint(panel, "Uganda mobile without country code, or your email.", 14)
        val password = passwordField(panel)
        authHint(panel, "Min. 4 Characters", 14)
        val button = action(panel, "LOG IN") {}
        authOr(panel)
        val googleButton =
            action(panel, "", false) {}
                .apply {
                    contentDescription = "Continue with Google"
                    val mark = getDrawable(R.drawable.google_mark)!!
                    mark.setBounds(0, 0, dp(24), dp(24))
                    setCompoundDrawables(mark, null, null, null)
                    setPadding(dp(14), dp(14), dp(14), dp(14))
                    minimumWidth = 0
                    layoutParams =
                        LinearLayout.LayoutParams(dp(52), dp(52)).apply {
                            gravity = Gravity.CENTER_HORIZONTAL
                            topMargin = 0
                            bottomMargin = dp(18)
                        }
                }
        googleButton.setOnClickListener { googleSignIn(googleButton, button) }
        button.setOnClickListener {
            val name = identifier.text.toString().trim()
            val secret = password.text.toString()
            if (name.isEmpty() || secret.isEmpty()) {
                toast("Enter your phone/email and password.")
                return@setOnClickListener
            }
            button.isEnabled = false
            googleButton.isEnabled = false
            task(
                { repository.login(name, secret) },
                {
                    password.text.clear()
                    navigate(if (BuildConfig.ADMIN_APP) "Home" else "Analytics")
                },
                {
                    button.isEnabled = true
                    googleButton.isEnabled = true
                    label(panel, errorMessage(it), 14).setTextColor(Color.WHITE)
                },
            )
        }
        label(panel, "Don’t have an account? Join Now", 13).apply {
            setTextColor(Color.WHITE)
            gravity = Gravity.CENTER
            setOnClickListener { registration() }
        }
        label(panel, "Continue without signing in", 13).apply {
            setTextColor(Color.rgb(179, 179, 219))
            gravity = Gravity.CENTER
            setOnClickListener { navigate(if (BuildConfig.ADMIN_APP) "Home" else "Analytics") }
        }
    }

    private fun home() {
        if (BuildConfig.ADMIN_APP) {
            adminHome()
            return
        }
        screen("")
        load("/api/home", public = true) { saved ->
            val data = saved.data
            val summary = data.optJSONObject("summary") ?: JSONObject()
            val hero =
                card(content, navy, 22).apply {
                    setPadding(dp(24), dp(22), dp(24), dp(19))
                    background =
                        WebsiteSurface(
                            resources.displayMetrics.density,
                            WebsiteSurface.Kind.SAVINGS,
                        )
                    (layoutParams as LinearLayout.LayoutParams).topMargin = 0
                }
            label(hero, "MY TOTAL SAVINGS", 11, true).apply {
                setTextColor(Color.argb(179, 255, 255, 255))
                letterSpacing = .08f
                setPadding(0, 0, 0, 0)
            }
            val amount = label(hero, ugx(summary.optDouble("total_savings")), 30, true)
            amount.setTextColor(Color.WHITE)
            amount.letterSpacing = -.02f
            amount.setPadding(0, dp(6), 0, dp(16))
            val meta = row(hero)
            val groups = summary.optInt("active_groups")
            label(meta, if (groups == 0) "No active groups yet" else "$groups active groups", 12)
                .apply {
                    setTextColor(Color.rgb(198, 198, 236))
                    layoutParams = LinearLayout.LayoutParams(0, -2, 1f)
                }
            label(meta, "${pct(summary.optDouble("pct_reached"))}% reached", 12)
                .setTextColor(Color.WHITE)
            progress(hero, summary.optDouble("pct_reached"), true)
            label(hero, "Goal ${ugx(summary.optDouble("total_goal"))}", 12).apply {
                setTextColor(Color.rgb(198, 198, 236))
                gravity = Gravity.END
            }
            data.optJSONObject("top_community")?.let { community ->
                val popular = card()
                label(popular, "POPULAR COMMUNITY", 10, true)
                val bar = row(popular)
                avatar(bar, community.optString("name"), 40)
                val text =
                    LinearLayout(this).apply {
                        orientation = LinearLayout.VERTICAL
                        setPadding(dp(10), 0, dp(8), 0)
                    }
                bar.addView(text, LinearLayout.LayoutParams(0, -2, 1f))
                label(
                    text,
                    community.optString("icon") + " " + community.optString("name"),
                    15,
                    true,
                )
                label(text, "${community.optInt("total_members")} people saving", 12)
                chip(bar, "EXPLORE", compact = true) { communityDetail(community.getString("id")) }
            }
            val target =
                card().apply {
                    minimumHeight = dp(280)
                    gravity = Gravity.CENTER
                    background = round(if (dark) paper else Color.rgb(249, 250, 253), 18, lineColor)
                }
            label(target, "AHEAD OF YOUR SAVINGS TARGET BY", 12, true).apply {
                gravity = Gravity.CENTER
                setTextColor(muted)
                setPadding(0, dp(14), 0, 0)
            }
            label(target, "${pct(summary.optDouble("avg_lead"))}%", 54, true).gravity =
                Gravity.CENTER
            label(
                    target,
                    if (summary.optDouble("avg_lead") < 0) "Behind target" else "◷  On target",
                    12,
                )
                .apply {
                    gravity = Gravity.CENTER
                    setPadding(0, 0, 0, dp(14))
                }
            val mine = data.optJSONArray("my_groups") ?: JSONArray()
            if (mine.length() > 0) {
                section("My savings groups")
                groupCards(mine, saved.offline)
            }
            val head = row(content)
            label(head, "Open Groups", 19, true).layoutParams = LinearLayout.LayoutParams(0, -2, 1f)
            chip(head, "Filter", compact = true) {
                groupFilter(data.optJSONArray("open_groups") ?: JSONArray())
            }
            groupCards(data.optJSONArray("open_groups") ?: JSONArray(), false, open = true)
            val start = card()
            illustration(start, "03-team-high-five", 140)
            label(start, "Start your own group with friends and family", 18, true).gravity =
                Gravity.CENTER
            action(start, "+ Create group") { requireLogin { createGroup() } }
            footer()
        }
    }

    private fun adminHome() {
        screen("")
        label(
            content,
            "Good morning${store.session()?.name?.substringBefore(' ')?.let{", $it"}?:""}.",
            24,
            true,
        )
        fun render(data: JSONObject?) {
            if (data == null) {
                val info = card(content, Color.rgb(255, 249, 224), 12)
                label(info, "Browse freely. Log in to register members and approve cash.", 13)
                val r = row(info)
                chip(r, "Log in") { loginScreen() }
                chip(r, "Create account") { registration() }
            }
            val hero = card(content, navy, 28)
            label(hero, "COLLECTED & APPROVED", 11).setTextColor(Color.rgb(198, 198, 236))
            val amount = label(hero, "UGX ••••••", 30, true).apply { setTextColor(Color.WHITE) }
            amount.setOnClickListener {
                amount.text =
                    if (amount.text.contains('•')) ugx(data?.optDouble("totalCollected") ?: 0.0)
                    else "UGX ••••••"
            }
            val buttons = row(hero)
            chip(buttons, "Register member") { requireLogin { registerMember() } }
            chip(buttons, "Create community") { requireLogin { createCommunity(true) } }
            section("Our services")
            val services =
                listOf(
                    Triple(
                        "Register Member",
                        "12-complete-your-profile",
                        { requireLogin { registerMember() } },
                    ),
                    Triple("Communities", "09-community-together", { navigate("Communities") }),
                    Triple("Approve Deposits", "19-safe-and-secure", { navigate("Approvals") }),
                    Triple(
                        "Transaction History",
                        "26-build-your-savings",
                        { requireLogin { history() } },
                    ),
                )
            for (pair in services.chunked(2)) {
                val r = row(content)
                for (item in pair) {
                    val c = card(r)
                    c.layoutParams =
                        LinearLayout.LayoutParams(0, dp(165), 1f).apply {
                            setMargins(dp(4), dp(8), dp(4), 0)
                        }
                    illustration(c, item.second, 100)
                    label(c, item.first, 13, true).gravity = Gravity.CENTER
                    c.setOnClickListener { item.third() }
                }
            }
            section("Alerts")
            alertCard(
                "Private communities only",
                "You manage members you register and cash you physically receive.",
            )
            alertCard(
                "${data?.optInt("pendingCount")?:0} waiting",
                "Consumer app cash and MoMo requests land here until you PIN-approve them.",
            )
            alertCard(
                "Groups cap at 7",
                "New members are placed in the public group closest to filling for their period.",
            )
        }
        if (store.session() == null) render(null) else load("/api/admin/home") { render(it.data) }
    }

    private fun groups() {
        screen("")
        val toggles = row(content)
        for ((index, title) in listOf("Open groups", "Private groups").withIndex()) {
            val selected = privateGroups == (index == 1)
            val item =
                LinearLayout(this).apply {
                    orientation = LinearLayout.VERTICAL
                    gravity = Gravity.CENTER
                }
            toggles.addView(item, LinearLayout.LayoutParams(0, -2, 1f))
            label(item, title, 15, true).apply {
                gravity = Gravity.CENTER
                setTextColor(if (selected) ink else muted)
            }
            label(item, if (index == 0) "join anytime" else "slide → invite-only", 12).gravity =
                Gravity.CENTER
            item.addView(
                View(this).apply { setBackgroundColor(if (selected) navy else Color.TRANSPARENT) },
                LinearLayout.LayoutParams(-1, dp(3)).apply { topMargin = dp(12) },
            )
            item.setOnClickListener {
                privateGroups = index == 1
                groups()
            }
        }
        label(
            content,
            if (privateGroups) "Your invite-only groups. Create one or join with a code."
            else "System open groups — start & close dates shown on each card.",
            13,
        )
        if (privateGroups) {
            val r = row(content)
            chip(r, "+ Create group") { requireLogin { createGroup() } }
            chip(r, "Join with code") { requireLogin { joinWithCode() } }
            if (store.session() == null) {
                emptyState("04-no-groups-empty", "Sign in to see your private groups.")
                return
            }
            load("/api/groups/mine") { saved ->
                val list = saved.data.optJSONArray("groups") ?: JSONArray()
                val private = JSONArray()
                for (i in 0 until list.length()) {
                    val g = list.getJSONObject(i)
                    if (g.optBoolean("is_private")) private.put(g)
                }
                groupCards(private, saved.offline)
            }
        } else
            load("/api/home", public = true) {
                groupCards(it.data.optJSONArray("open_groups") ?: JSONArray(), false, open = true)
                val c = card()
                illustration(c, "04-no-groups-empty", 120)
                label(c, "Failed to find a group?", 20, true)
                label(c, "Create a group and invite your friends to save with you.", 14)
                action(c, "+ Create group") { requireLogin { createGroup() } }
                footer()
            }
    }

    private fun groupCards(groups: JSONArray, offline: Boolean, open: Boolean = false) {
        if (groups.length() == 0) {
            emptyState("04-no-groups-empty", "No savings groups to show.")
            return
        }
        for (i in 0 until groups.length()) {
            val g = groups.getJSONObject(i)
            val id = g.optString("group_id").ifBlank { g.optString("id") }
            val name = groupName(g)
            val c =
                card().apply {
                    setPadding(dp(16), dp(16), dp(16), dp(14))
                    (layoutParams as LinearLayout.LayoutParams).apply {
                        topMargin = dp(14)
                        bottomMargin = dp(14)
                    }
                }
            fun text(
                parent: LinearLayout,
                value: String,
                size: Int,
                bold: Boolean = false,
                tint: Int? = null,
            ): TextView =
                label(parent, value, size, bold).apply {
                    setPadding(0, 0, 0, 0)
                    if (tint != null) setTextColor(tint)
                }
            val top = row(c).apply { gravity = Gravity.TOP }
            val info = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
            top.addView(info, LinearLayout.LayoutParams(0, -2, 1f))
            text(info, name, 17, true, if (dark) ink else Color.rgb(17, 17, 17))
            text(
                    info,
                    "${g.optInt("period_months")} months · ${if(g.optBoolean("is_private"))"Private group" else "closes at ${g.optInt("max_members",7)} members"}",
                    12,
                )
                .apply {
                    setPadding(0, dp(4), 0, 0)
                }
            val members =
                LinearLayout(this).apply {
                    orientation = LinearLayout.VERTICAL
                    gravity = Gravity.END
                }
            top.addView(members, LinearLayout.LayoutParams(-2, -2))
            text(members, "${g.optInt("current_members")}/${g.optInt("max_members",7)}", 13, true)
                .gravity = Gravity.END
            text(members, "members", 12).apply {
                gravity = Gravity.END
                setPadding(0, dp(5), 0, 0)
            }
            if (g.optString("name").let { it.isBlank() || it == "null" }) {
                text(c, "First to join names it", 10, true, Color.rgb(26, 110, 53)).apply {
                    background = round(Color.rgb(230, 244, 234), 20)
                    letterSpacing = .04f
                    setPadding(dp(8), dp(3), dp(8), dp(3))
                    layoutParams = LinearLayout.LayoutParams(-2, -2).apply { topMargin = dp(8) }
                }
            }
            val own = g.has("total_deposited")
            val metrics = row(c)
            metrics.layoutParams = LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(10) }
            text(
                    metrics,
                    (if (own) "Your savings: " else "Group total: ") +
                        ugx(g.optDouble(if (own) "total_deposited" else "total_saved")),
                    12,
                )
                .layoutParams = LinearLayout.LayoutParams(0, -2, 1f)
            text(metrics, "${pct(g.optDouble("target_pct"))}%", 10, true)
            c.addView(
                WebsiteProgress(
                    this,
                    g.optDouble("target_pct"),
                    ink,
                    if (dark) lineColor else Color.rgb(238, 240, 248),
                    false,
                ),
                LinearLayout.LayoutParams(-1, dp(5)).apply {
                    topMargin = dp(6)
                    bottomMargin = dp(16)
                },
            )
            val foot = row(c)
            val dates =
                text(
                    foot,
                    "Start ${shortDate(g.optString("starts_at"))} · Closes ${shortDate(g.optString("closes_at"))}",
                    11,
                )
            dates.layoutParams = LinearLayout.LayoutParams(0, -2, 1f)
            val closes = dates.text.indexOf("Closes")
            if (closes >= 0)
                dates.text =
                    android.text.SpannableString(dates.text).apply {
                        setSpan(
                            android.text.style.ForegroundColorSpan(Color.rgb(192, 57, 43)),
                            closes,
                            length,
                            0,
                        )
                        setSpan(android.text.style.StyleSpan(Typeface.BOLD), closes, length, 0)
                    }
            val lead = g.optDouble("avg_member_lead", g.optDouble("avg_lead"))
            text(
                    foot,
                    (if (lead < 0) "▼ " else "▲ ") + pct(lead) + "%",
                    10,
                    true,
                    if (lead < 0) Color.rgb(163, 45, 45) else Color.rgb(26, 110, 53),
                )
                .apply {
                    background =
                        round(
                            if (lead < 0) Color.rgb(253, 236, 234) else Color.rgb(230, 244, 234),
                            20,
                        )
                    setPadding(dp(9), dp(3), dp(9), dp(3))
                    layoutParams = LinearLayout.LayoutParams(-2, -2).apply { marginStart = dp(8) }
                }
            if (id.isNotBlank()) {
                action(c, if (open) "Join this group" else "View group") {
                        if (open) requireLogin { joinGroup(id, name) } else groupDetail(id)
                    }
                    .apply {
                        textSize = 13f
                        background = messageBackground(22)
                        setTextColor(if (dark) navy else Color.WHITE)
                        minimumHeight = dp(44)
                        minHeight = dp(44)
                    }
                c.setOnClickListener {
                    if (open) requireLogin { joinGroup(id, name) } else groupDetail(id)
                }
            }
        }
    }

    private fun groupDetail(id: String) {
        subpage = true
        screen("Group savings")
        load("/api/groups/$id", public = true) { saved ->
            val data = saved.data
            val g = data.getJSONObject("group")
            val c = card(content, navy, 22)
            label(c, groupName(g), 24, true).setTextColor(Color.WHITE)
            label(c, g.optString("code"), 13).setTextColor(Color.WHITE)
            label(c, ugx(g.optDouble("total_saved")), 32, true).setTextColor(Color.WHITE)
            progress(c, g.optDouble("target_pct"), true)
            label(
                    c,
                    "${g.optInt("current_members")}/${g.optInt("max_members",7)} members · ${g.optInt("period_months")} months",
                    13,
                )
                .setTextColor(Color.WHITE)
            if (data.optBoolean("is_member")) {
                action(content, "+ Deposit") { deposit(id, groupName(g)) }
                action(content, "Group messages", false) {
                    messages("/api/groups/$id/messages", groupName(g))
                }
            } else
                action(content, "Join this group") { requireLogin { joinGroup(id, groupName(g)) } }
            section("Members")
            val members = data.optJSONArray("members") ?: JSONArray()
            if (members.length() == 0) note("Be the first to join this group.")
            for (i in 0 until members.length()) {
                val m = members.getJSONObject(i)
                val card = card()
                label(
                    card,
                    "${m.optInt("rank_in_group",i+1)}  ${m.optString("display_name")}",
                    17,
                    true,
                )
                label(
                    card,
                    "${ugx(m.optDouble("total_deposited"))} saved · ${pct(m.optDouble("target_pct"))}% of goal",
                    13,
                )
                card.setOnClickListener { publicMember(m.getString("user_id")) }
            }
            action(content, "Share group", false) {
                share(
                    "${BuildConfig.API_URL}/kibbisave_join_group.html?id=$id&code=${Uri.encode(g.optString("code"))}"
                )
            }
        }
    }

    private fun leaderboard() {
        screen("Group leaderboard")
        note(
            "Public groups join the board once they close. Ranked by average member lead. Private groups stay off this list."
        )
        load("/api/leaderboard", public = true) { saved ->
            val list = saved.data.optJSONArray("groups") ?: JSONArray()
            if (list.length() == 0) {
                emptyState(
                    "10-leaderboard-champion",
                    "The leaderboard is waiting for its first groups.",
                )
                return@load
            }
            for (i in 0 until list.length()) {
                val g = list.getJSONObject(i)
                val c = card()
                label(c, "${g.optInt("leaderboard_rank",i+1)}   ${groupName(g)}", 21, true)
                label(
                    c,
                    "${pct(g.optDouble("avg_member_lead"))}% ahead · ${ugx(g.optDouble("total_saved"))} saved",
                    14,
                )
                progress(c, g.optDouble("target_pct"))
                c.setOnClickListener { groupDetail(g.getString("id")) }
            }
        }
    }

    private fun account() {
        screen("")
        if (store.session() == null) {
            content.setBackgroundColor(if (dark) canvasColor else Color.rgb(242, 242, 243))
            root.setBackgroundColor(if (dark) canvasColor else Color.rgb(242, 242, 243))
            val welcome =
                card(radius = 14).apply {
                    setPadding(dp(12), dp(14), dp(12), dp(12))
                    background = round(paper, 14)
                }
            label(
                    welcome,
                    "Join KibbiSave to track your groups, deposits, and savings progress — or log in if you already have an account.",
                    15,
                )
                .apply {
                    setPadding(0, 0, 0, dp(10))
                    setLineSpacing(dp(5).toFloat(), 1f)
                }
            val choices = row(welcome)
            chip(choices, "JOIN NOW") { registration() }
            chip(choices, "LOG IN", false) { loginScreen() }
            val actions =
                card(radius = 14).apply {
                    setPadding(0, 0, 0, 0)
                    background = round(paper, 14)
                }
            accountRow(actions, "lock", "Deposit") { selectDepositGroup() }
            actions.addView(
                View(this).apply { setBackgroundColor(lineColor) },
                LinearLayout.LayoutParams(-1, dp(1)),
            )
            val theme = accountRow(actions, "sun", "Dark Theme") {}
            val toggle =
                Switch(this).apply {
                    contentDescription = "Dark theme"
                    isChecked = dark
                    setOnCheckedChangeListener { _, checked ->
                        dark = checked
                        appearance.edit().putBoolean("dark", dark).apply()
                        account()
                    }
                }
            theme.addView(toggle, LinearLayout.LayoutParams(dp(46), dp(32)))
            theme.setOnClickListener { toggle.isChecked = !toggle.isChecked }
            val help =
                card(radius = 14).apply {
                    setPadding(0, 0, 0, 0)
                    background = round(paper, 14)
                }
            accountAccordion(
                help,
                "help",
                "Help Center",
                listOf(
                    "Help" to "help",
                    "Deposit" to "deposit",
                    "Rules" to "rules",
                    "Responsible saving" to "responsible-saving",
                ),
            )
            accountAccordion(
                help,
                "communities",
                "More on KibbiSave",
                listOf(
                    "About" to "about",
                    "News" to "news",
                    "Terms and Conditions" to "terms",
                    "Privacy" to "privacy",
                    "Cookies" to "cookies",
                ),
            )
            return
        }
        load(if (BuildConfig.ADMIN_APP) "/api/admin/profile" else "/api/profile") { saved ->
            val data = saved.data
            val user = data.optJSONObject("user") ?: data.optJSONObject("profile") ?: data
            val hero = card(content, navy, 22)
            avatar(
                hero,
                user.optString("name", store.session()?.name ?: "Member"),
                68,
                user.optString("picture"),
            )
            label(
                    hero,
                    user.optString(
                        "name",
                        user.optString("display_name", store.session()?.name ?: "Member"),
                    ),
                    24,
                    true,
                )
                .setTextColor(Color.WHITE)
            label(hero, user.optString("location", "Uganda"), 13)
                .setTextColor(Color.rgb(198, 198, 236))
            val stats = data.optJSONObject("stats") ?: JSONObject()
            label(
                    hero,
                    if (BuildConfig.ADMIN_APP)
                        "${ugx(stats.optDouble("total_collected"))} collected"
                    else
                        "${stats.optInt("groups")} Groups · ${ugx(stats.optDouble("totalSaved",stats.optDouble("total_saved")))} Lifetime savings",
                    14,
                )
                .setTextColor(Color.WHITE)
            if (!BuildConfig.ADMIN_APP) {
                val r = row(content)
                chip(r, "Deposit") { selectDepositGroup() }
                chip(r, "+ Create group") { createGroup() }
            }
            menu("profile", "Personal details", "Name, phone, location") { navigate("Profile") }
            if (BuildConfig.ADMIN_APP) {
                menu("lock", "Approval PIN", "Change your four-digit approval PIN") { changePin() }
                menu("groups", "Managed communities", "Members and collected savings") {
                    navigate("Communities")
                }
            } else {
                menu("lock", "Payment methods", "Add MTN MoMo, Airtel or bank") { paymentMethods() }
                menu("analytics", "Savings history", "All deposits and earnings") { history() }
                menu("communities", "Communities and groups", "Your history · Alive or finished") {
                    memberships()
                }
                menu("analytics", "Recent activity", "Deposits, joins, and updates") {
                    activity(data.optJSONArray("activity") ?: JSONArray())
                }
                menu("bell", "Notifications", "Deposits, rank changes, reminders") {
                    notifications()
                }
                menu("eye", "App settings", "Language, notifications, theme") { settingsScreen() }
            }
            menu("back", "Log out", "Remove the session and saved data from this app") {
                AlertDialog.Builder(this)
                    .setTitle("Log out?")
                    .setMessage("Your saved data and session will be removed from this app.")
                    .setNegativeButton("Cancel", null)
                    .setPositiveButton("Log out") { _, _ ->
                        task(
                            { repository.logout() },
                            { navigate(if (BuildConfig.ADMIN_APP) "Home" else "Analytics") },
                            {
                                store.clear()
                                navigate(if (BuildConfig.ADMIN_APP) "Home" else "Analytics")
                            },
                        )
                    }
                    .show()
            }
            if (store.pendingWrite() != null) unresolvedWrite()
        }
    }

    private fun history() {
        subpage = true
        screen(if (BuildConfig.ADMIN_APP) "Transaction History" else "Savings history")
        if (store.session() == null) {
            action(content, "Log in") { loginScreen() }
            return
        }
        load(if (BuildConfig.ADMIN_APP) "/api/admin/transactions" else "/api/profile/history") {
            saved ->
            val list =
                saved.data.optJSONArray(if (BuildConfig.ADMIN_APP) "transactions" else "history")
                    ?: JSONArray()
            if (list.length() == 0) emptyState("26-build-your-savings", "No transactions to show.")
            for (i in 0 until list.length()) {
                val t = list.getJSONObject(i)
                val c = card()
                label(
                    c,
                    t.optString("title").ifBlank { t.optString("display_name", "Deposit") },
                    17,
                    true,
                )
                label(
                    c,
                    if (BuildConfig.ADMIN_APP) ugx(t.optDouble("amount"))
                    else t.optString("amount"),
                    23,
                    true,
                )
                label(c, t.optString("sub", t.optString("payment_method")), 13)
                label(c, t.optString("status"), 12)
                label(c, t.optString("date").ifBlank { shortDate(t.optString("created_at")) }, 12)
            }
        }
    }

    private fun consumerCommunities() {
        screen("")
        load("/api/communities", public = true) { saved ->
            val list = saved.data.optJSONArray("communities") ?: JSONArray()
            for ((kind, heading) in
                listOf(
                    "public" to "Public communities",
                    "private" to "Private communities",
                    "organisation" to "Organisation communities",
                    "donating" to "Donating communities",
                )) {
                val headingRow = row(content)
                label(headingRow, heading, 19, true).layoutParams =
                    LinearLayout.LayoutParams(0, -2, 1f)
                iconButton(headingRow, "communities") {
                    AlertDialog.Builder(this)
                        .setTitle(heading)
                        .setMessage(
                            when (kind) {
                                "private" ->
                                    "A community for your circle. Joining may require a code."
                                "organisation" -> "Save together with your team or organisation."
                                "donating" -> "Bring people together to save for a cause."
                                else -> "Find people with shared goals and save together."
                            }
                        )
                        .setPositiveButton("Close", null)
                        .show()
                }
                val members =
                    (0 until list.length())
                        .map { list.getJSONObject(it) }
                        .filter {
                            it.optString("kind").ifBlank {
                                if (it.optBoolean("is_public")) "public" else "private"
                            } == kind
                        }
                if (members.isEmpty()) {
                    val empty = card()
                    label(
                            empty,
                            "No $kind communities yet. Create one for ${if (kind == "private") "your circle" else if (kind == "organisation") "your team" else if (kind == "donating") "a cause" else "people saving together"}.",
                            13,
                        )
                        .gravity = Gravity.CENTER
                    action(
                        empty,
                        "Create ${if (kind == "organisation") "an" else "a"} $kind community",
                        false,
                    ) {
                        requireLogin { createCommunity(false, kind) }
                    }
                } else {
                    val carousel =
                        HorizontalScrollView(this).apply {
                            isHorizontalScrollBarEnabled = false
                            clipToPadding = false
                        }
                    val cards = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
                    carousel.addView(cards)
                    content.addView(carousel, LinearLayout.LayoutParams(-1, -2))
                    for (community in members) {
                        val card = card(cards)
                        card.layoutParams =
                            LinearLayout.LayoutParams(
                                    (resources.displayMetrics.widthPixels /
                                            resources.displayMetrics.density)
                                        .toInt()
                                        .let { dp(it - 48) },
                                    -2,
                                )
                                .apply { setMargins(dp(3), dp(8), dp(14), dp(14)) }
                        val top = row(card)
                        label(top, community.optString("name"), 17, true).apply {
                            setTextColor(if (dark) ink else Color.rgb(17, 17, 17))
                            layoutParams = LinearLayout.LayoutParams(0, -2, 1f)
                        }
                        label(top, kind.replaceFirstChar { it.uppercase() }, 10, true).apply {
                            background =
                                round(if (dark) canvasColor else Color.rgb(238, 240, 255), 9)
                            setPadding(dp(7), dp(3), dp(7), dp(3))
                            layoutParams = LinearLayout.LayoutParams(-2, -2)
                        }
                        label(
                            card,
                            "${community.optInt("total_members")} members · ${community.optString("city").takeUnless { it == "null" || it.isBlank() } ?: community.optString("country", "Uganda")}",
                            11,
                        )
                        label(card, community.optString("about"), 13)
                        label(card, "read more", 12, true).setOnClickListener {
                            communityDetail(community.getString("id"))
                        }
                        label(card, "UGX", 10).gravity = Gravity.END
                        val amount = community.optDouble("total_saved")
                        label(
                                card,
                                if (amount >= 1000000)
                                    String.format(Locale.UK, "%.1fM", amount / 1000000)
                                else if (amount >= 1000) "${(amount / 1000).toInt()}k"
                                else NumberFormat.getIntegerInstance(Locale.UK).format(amount),
                                36,
                                true,
                            )
                            .gravity = Gravity.END
                        label(card, "TOTAL SAVINGS", 9).gravity = Gravity.END
                        val totals = row(card)
                        label(totals, "${community.optDouble("pct_reached").toInt()}%", 12, true)
                            .layoutParams = LinearLayout.LayoutParams(0, -2, 1f)
                        label(
                                totals,
                                NumberFormat.getIntegerInstance(Locale.UK)
                                    .format(community.optDouble("total_goal")),
                                11,
                            )
                            .apply {
                                gravity = Gravity.END
                                layoutParams = LinearLayout.LayoutParams(-2, -2)
                            }
                        progress(card, community.optDouble("pct_reached"))
                        action(card, "Join community") {
                            communityDetail(community.getString("id"))
                        }
                    }
                }
            }
            footer()
        }
    }

    private fun communities() {
        if (!BuildConfig.ADMIN_APP) {
            consumerCommunities()
            return
        }
        screen(if (BuildConfig.ADMIN_APP) "Communities" else "Discover communities")
        if (BuildConfig.ADMIN_APP && store.session() == null) {
            emptyState("09-community-together", "Log in to manage your communities.")
            action(content, "Log in") { loginScreen() }
            return
        }
        if (!BuildConfig.ADMIN_APP) {
            val r = row(content)
            for (type in listOf("All", "Public", "Private")) chip(
                r,
                type,
                communityFilter == type,
            ) {
                communityFilter = type
                communities()
            }
        }
        action(content, "+ Create community", false) {
            requireLogin { createCommunity(BuildConfig.ADMIN_APP) }
        }
        load(
            if (BuildConfig.ADMIN_APP) "/api/admin/communities" else "/api/communities",
            public = !BuildConfig.ADMIN_APP,
        ) { saved ->
            val list = saved.data.optJSONArray("communities") ?: JSONArray()
            if (list.length() == 0) emptyState("09-community-together", "No communities to show.")
            for (i in 0 until list.length()) {
                val c = list.getJSONObject(i)
                if (
                    !BuildConfig.ADMIN_APP &&
                        communityFilter != "All" &&
                        c.optBoolean("is_public") != (communityFilter == "Public")
                )
                    continue
                val card = card()
                label(card, c.optString("icon", "👥") + " " + c.optString("name"), 21, true)
                label(card, c.optString("about"), 14)
                label(
                    card,
                    "${c.optInt("total_members")} people saving · ${ugx(c.optDouble("total_saved"))}",
                    13,
                )
                action(card, if (BuildConfig.ADMIN_APP) "View members" else "EXPLORE", false) {
                    if (BuildConfig.ADMIN_APP) adminCommunity(c)
                    else communityDetail(c.getString("id"))
                }
            }
            if (BuildConfig.ADMIN_APP) action(content, "Search members", false) { searchScreen() }
        }
    }

    private fun approvals() {
        screen("Approve Deposits")
        if (store.session() == null) {
            emptyState("19-safe-and-secure", "Log in to view pending requests.")
            action(content, "Log in") { loginScreen() }
            return
        }
        if (store.pendingWrite() != null) unresolvedWrite()
        load("/api/admin/approvals") { saved ->
            val list = saved.data.optJSONArray("requests") ?: JSONArray()
            if (list.length() == 0)
                emptyState("19-safe-and-secure", "No deposits awaiting approval.")
            for (i in 0 until list.length()) {
                val t = list.getJSONObject(i)
                val c = card()
                label(c, t.optString("display_name", "Member"), 20, true)
                label(c, ugx(t.optDouble("amount")), 29, true)
                label(c, "${t.optString("payment_method")} · ${t.optString("community_name")}", 13)
                action(c, "Verify receipt and approve") { approve(t) }.isEnabled =
                    online() && store.pendingWrite() == null
            }
        }
    }

    private fun communityDetail(id: String) {
        subpage = true
        screen("Community")
        load("/api/communities/$id", public = true) { saved ->
            val data = saved.data
            val c = data.getJSONObject("community")
            val hero = card(content, navy, 22)
            label(hero, c.optString("icon", "👥") + " " + c.optString("name"), 26, true)
                .setTextColor(Color.WHITE)
            label(hero, c.optString("about"), 15).setTextColor(Color.WHITE)
            label(hero, "${c.optInt("total_members")} people saving", 14).setTextColor(Color.WHITE)
            label(hero, ugx(c.optDouble("total_saved")), 32, true).setTextColor(Color.WHITE)
            progress(hero, c.optDouble("pct_reached"), true)
            if (data.optBoolean("is_member"))
                action(content, "Community messages") {
                    messages("/api/communities/$id/messages", c.optString("name"))
                }
            else
                action(content, "Join community") {
                    requireLogin {
                        val code = EditText(this).apply { hint = "Joining code (if private)" }
                        AlertDialog.Builder(this)
                            .setTitle("Join ${c.optString("name")}")
                            .setView(code)
                            .setNegativeButton("Cancel", null)
                            .setPositiveButton("Join") { _, _ ->
                                change(
                                    "/api/communities/$id/join",
                                    JSONObject().put("code", code.text.toString()),
                                ) {
                                    communityDetail(id)
                                }
                            }
                            .show()
                    }
                }
            section("Member standings")
            val list = data.optJSONArray("standings") ?: JSONArray()
            if (list.length() == 0) emptyState("09-community-together", "No member standings yet.")
            for (i in 0 until list.length()) {
                val m = list.getJSONObject(i)
                val card = card()
                label(card, "${m.optInt("rank",i+1)}  ${m.optString("display_name")}", 18, true)
                label(
                    card,
                    "${ugx(m.optDouble("total_savings"))} saved · ${pct(m.optDouble("avg_lead"))}% ahead",
                    13,
                )
                card.setOnClickListener { publicMember(m.getString("user_id")) }
                if (
                    data.optBoolean("is_creator") &&
                        m.optString("user_id") != data.optString("viewer_id")
                )
                    action(card, "Message member", false) {
                        messages(
                            "/api/communities/$id/members/${m.getString("user_id")}/messages",
                            m.optString("display_name"),
                        )
                    }
            }
            action(content, "Share community", false) {
                share("${BuildConfig.API_URL}/kibbisave_cause_detail.html?id=$id")
            }
        }
    }

    private fun createCommunity(admin: Boolean, defaultKind: String? = null) {
        subpage = true
        screen("Create community")
        val name = field(content, "Community name")
        val about = field(content, "About (up to 150 characters)")
        val icon = field(content, "Community icon (emoji)").apply { setText("👥") }
        val city = if (!admin) field(content, "City") else null
        val kind =
            if (!admin)
                select(
                    content,
                    "Community type",
                    listOf("Public", "Private", "Organisation", "Donating"),
                )
            else null
        if (kind != null && defaultKind != null)
            kind.setSelection(
                listOf("public", "private", "organisation", "donating")
                    .indexOf(defaultKind)
                    .coerceAtLeast(0)
            )
        val pin =
            if (admin)
                field(
                    content,
                    "Approval PIN",
                    InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_VARIATION_PASSWORD,
                )
            else null
        action(content, "Create community") {
            if (name.text.isBlank()) {
                toast("Enter a community name.")
                return@action
            }
            val body =
                JSONObject()
                    .put("name", name.text.toString().trim())
                    .put("about", about.text.toString().take(150))
                    .put("icon", icon.text.toString())
            if (admin) body.put("pin", pin?.text.toString())
            else
                body
                    .put("city", city?.text.toString())
                    .put("country", "Uganda")
                    .put(
                        "kind",
                        listOf("public", "private", "organisation", "donating")[
                            kind!!.selectedItemPosition],
                    )
            change(if (admin) "/api/admin/communities" else "/api/communities", body) { result ->
                val c = result.getJSONObject("community")
                if (admin) adminCommunity(c) else communityDetail(c.getString("id"))
            }
        }
    }

    private fun messages(path: String, title: String) {
        if (store.session() == null) {
            loginScreen()
            return
        }
        subpage = true
        screen(title)
        load(path) { saved ->
            val list = saved.data.optJSONArray("messages") ?: JSONArray()
            if (list.length() == 0) note("No messages yet. Start the conversation.")
            for (i in 0 until list.length()) {
                val m = list.getJSONObject(i)
                val own = m.optString("user_id") == store.session()?.id
                val c = card(content, if (own) Color.rgb(235, 236, 255) else paper, 16)
                label(c, m.optString("display_name", "Member"), 12, true)
                label(c, m.optString("body"), 16)
                label(c, shortDate(m.optString("created_at")), 10)
            }
            val input = field(content, "Message (up to 500 characters)")
            input.isSingleLine = false
            action(content, "Send message") {
                val text = input.text.toString().trim()
                if (text.isEmpty()) {
                    toast("Enter a message.")
                    return@action
                }
                change(path, JSONObject().put("body", text.take(500))) { messages(path, title) }
            }
        }
    }

    private fun publicMember(id: String) {
        subpage = true
        screen("Saver profile")
        load("/api/users/$id/home", public = true) { saved ->
            val data = saved.data
            val user = data.optJSONObject("user") ?: JSONObject()
            val summary = data.optJSONObject("summary") ?: JSONObject()
            val c = card(content, navy, 22)
            label(c, user.optString("name", user.optString("display_name", "Member")), 25, true)
                .setTextColor(Color.WHITE)
            label(c, ugx(summary.optDouble("total_savings")), 33, true).setTextColor(Color.WHITE)
            label(
                    c,
                    "${summary.optInt("active_groups")} active groups · ${pct(summary.optDouble("avg_lead"))}% ahead",
                    13,
                )
                .setTextColor(Color.WHITE)
            section("Savings groups")
            groupCards(
                data.optJSONArray("my_groups") ?: data.optJSONArray("groups") ?: JSONArray(),
                false,
            )
        }
    }

    private fun personalDetails(user: JSONObject) {
        subpage = true
        screen("Personal details")
        val c = card()
        avatar(c, user.optString("name", "Member"), 72, user.optString("picture"))
        action(c, "Update photo", false) {
            photoResult = { image ->
                change("/api/profile/avatar", JSONObject().put("image", image), "PUT") {
                    personalDetails(user)
                }
            }
            photoPicker.launch("image/*")
        }
        label(
            c,
            "${user.optString("handle","@member")} · ${user.optString("location","Uganda")}",
            13,
        )
        label(c, "Member since ${user.optString("memberSince","—")}", 12)
        val name = field(content, "Full name").apply { setText(user.optString("name")) }
        val phone =
            field(content, "Phone / account number", InputType.TYPE_CLASS_PHONE).apply {
                setText(user.optString("phone").takeUnless { it == "null" } ?: "")
            }
        val location = field(content, "Location").apply { setText(user.optString("location")) }
        label(content, "Email: ${user.optString("email")}", 14)
        action(content, "Save personal details") {
            change(
                "/api/profile",
                JSONObject()
                    .put("display_name", name.text.toString())
                    .put("phone", phone.text.toString())
                    .put("location", location.text.toString()),
                "PATCH",
            ) { result ->
                val updated = result.getJSONObject("user")
                store.session()?.let {
                    store.refreshSession(it.copy(name = updated.optString("name", it.name)))
                }
                navigate("Profile")
            }
        }
    }

    private fun memberships() {
        subpage = true
        screen("Communities and groups")
        section("Communities")
        load("/api/communities/mine") { saved ->
            val list = saved.data.optJSONArray("communities") ?: JSONArray()
            if (list.length() == 0) note("No communities in your history yet.")
            for (i in 0 until list.length()) {
                val community = list.getJSONObject(i)
                menu(
                    "communities",
                    community.optString("name"),
                    "${community.optInt("total_members")} people saving",
                ) {
                    communityDetail(community.getString("id"))
                }
            }
            section("Groups")
            load("/api/groups/mine") {
                groupCards(it.data.optJSONArray("groups") ?: JSONArray(), it.offline)
            }
        }
    }

    private fun activity(list: JSONArray) {
        subpage = true
        screen("Recent activity")
        if (list.length() == 0)
            emptyState(
                "26-build-your-savings",
                "No activity yet — join a group and make your first deposit.",
            )
        for (i in 0 until list.length()) {
            val t = list.getJSONObject(i)
            val c = card()
            label(c, t.optString("title", t.optString("action")), 17, true)
            label(c, t.optString("sub"), 13)
            label(c, t.optString("amount"), 18, true)
            label(c, t.optString("date", shortDate(t.optString("created_at"))), 12)
        }
    }

    private fun notifications() {
        subpage = true
        screen("Notifications")
        load("/api/profile/notifications") { saved ->
            val list = saved.data.optJSONArray("notifications") ?: JSONArray()
            if (list.length() == 0) emptyState("17-no-results-found", "No notifications yet.")
            for (i in 0 until list.length()) {
                val n = list.getJSONObject(i)
                val c = card()
                label(c, n.optString("title"), 17, !n.optBoolean("is_read"))
                label(c, n.optString("body"), 14)
                label(c, shortDate(n.optString("created_at")), 12)
                if (!n.optBoolean("is_read"))
                    action(c, "Mark as read", false) {
                        change(
                            "/api/profile/notifications/${n.getString("id")}/read",
                            JSONObject(),
                            "PATCH",
                        ) {
                            notifications()
                        }
                    }
            }
        }
    }

    private fun paymentMethods() {
        subpage = true
        screen("Payment methods")
        load("/api/profile/payment-methods") { saved ->
            val list = saved.data.optJSONArray("methods") ?: JSONArray()
            if (list.length() == 0) note("No saved payment methods.")
            for (i in 0 until list.length()) {
                val m = list.getJSONObject(i)
                val c = card()
                label(
                    c,
                    m.optString("label").takeUnless { it.isBlank() || it == "null" }
                        ?: m.optString("provider"),
                    18,
                    true,
                )
                label(c, m.optString("account_ref"), 15)
                if (m.optBoolean("is_default")) label(c, "Default", 12, true)
                action(c, "Remove", false) {
                    AlertDialog.Builder(this)
                        .setTitle("Remove payment method?")
                        .setNegativeButton("Cancel", null)
                        .setPositiveButton("Remove") { _, _ ->
                            change(
                                "/api/profile/payment-methods/${m.getString("id")}",
                                JSONObject(),
                                "DELETE",
                            ) {
                                paymentMethods()
                            }
                        }
                        .show()
                }
            }
            section("Add payment method")
            val provider = select(content, "Provider", listOf("MTN MoMo", "Airtel Money", "Bank"))
            val label = field(content, "Label")
            val account = field(content, "Phone or account number")
            val primary =
                CheckBox(this).apply {
                    text = "Make default"
                    setTextColor(ink)
                }
            content.addView(primary)
            action(content, "Save payment method") {
                change(
                    "/api/profile/payment-methods",
                    JSONObject()
                        .put(
                            "provider",
                            listOf("mtn_momo", "airtel", "bank")[provider.selectedItemPosition],
                        )
                        .put("label", label.text.toString())
                        .put("account_ref", account.text.toString())
                        .put("is_default", primary.isChecked),
                ) {
                    paymentMethods()
                }
            }
        }
    }

    private fun settingsScreen() {
        subpage = true
        screen("App settings")
        load("/api/profile/settings") { saved ->
            val settings = saved.data.getJSONObject("settings")
            val lang = select(content, "Language", listOf("English", "Luganda", "Swahili"))
            lang.setSelection(
                listOf("en", "lg", "sw")
                    .indexOf(settings.optString("language", "en"))
                    .coerceAtLeast(0)
            )
            fun toggle(title: String, key: String): Switch {
                val s =
                    Switch(this).apply {
                        text = title
                        textSize = 16f
                        setTextColor(ink)
                        isChecked = settings.optBoolean(key, true)
                        setPadding(0, dp(16), 0, dp(16))
                    }
                content.addView(s)
                return s
            }
            val deposits = toggle("Deposit notifications", "notify_deposits")
            val ranks = toggle("Rank changes", "notify_ranks")
            val reminders = toggle("Savings reminders", "notify_reminders")
            val theme = toggle("Dark mode", "dark_mode")
            action(content, "Save settings") {
                change(
                    "/api/profile/settings",
                    JSONObject()
                        .put("language", listOf("en", "lg", "sw")[lang.selectedItemPosition])
                        .put("notify_deposits", deposits.isChecked)
                        .put("notify_ranks", ranks.isChecked)
                        .put("notify_reminders", reminders.isChecked)
                        .put("dark_mode", theme.isChecked),
                    "PATCH",
                ) {
                    dark = theme.isChecked
                    appearance.edit().putBoolean("dark", dark).apply()
                    settingsScreen()
                }
            }
            action(content, "Clear saved offline data", false) {
                task({ store.clearSnapshots() }, { toast("Saved data cleared.") })
            }
            section("About KibbiSave")
            for ((title, path) in
                listOf(
                    "About" to "about",
                    "Help" to "help",
                    "Privacy" to "privacy",
                    "Terms and Conditions" to "terms",
                    "Responsible saving" to "responsible-saving",
                )) menu("lock", title, "") {
                legalScreen(title, path)
            }
        }
    }

    private fun searchScreen() {
        subpage = true
        screen("Search")
        val q =
            field(
                content,
                if (BuildConfig.ADMIN_APP) "Search members by name, username or phone"
                else "Search groups, communities and savers",
            )
        val results = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        action(content, "Search") {
            val value = q.text.toString().trim()
            if (value.isEmpty()) return@action
            results.removeAllViews()
            task(
                {
                    repository
                        .publicLoad(
                            if (BuildConfig.ADMIN_APP)
                                "/api/admin/communities?q=${Uri.encode(value)}"
                            else "/api/search?q=${Uri.encode(value)}"
                        )
                        .data
                },
                { data ->
                    val list =
                        data.optJSONArray(if (BuildConfig.ADMIN_APP) "members" else "results")
                            ?: JSONArray()
                    if (list.length() == 0) label(results, "No results found.", 16)
                    for (i in 0 until list.length()) {
                        val item = list.getJSONObject(i)
                        val c = card(results)
                        label(c, item.optString("name", item.optString("display_name")), 18, true)
                        label(c, item.optString("area", item.optString("community_name")), 12)
                        c.setOnClickListener {
                            if (BuildConfig.ADMIN_APP) adminMember(item.getString("id"))
                            else
                                when (item.optString("type")) {
                                    "group" -> groupDetail(item.getString("id"))
                                    "community" -> communityDetail(item.getString("id"))
                                    else -> publicMember(item.getString("id"))
                                }
                        }
                    }
                },
            )
        }
        content.addView(results)
    }

    private fun groupFilter(groups: JSONArray) {
        AlertDialog.Builder(this)
            .setTitle("Filter groups")
            .setItems(
                arrayOf("All periods", "2 months", "3 months", "5 months", "8 months", "12 months")
            ) { _, which ->
                subpage = true
                screen("Open Groups")
                val filtered = JSONArray()
                val months = listOf(0, 2, 3, 5, 8, 12)[which]
                for (i in 0 until groups.length()) {
                    val g = groups.getJSONObject(i)
                    if (months == 0 || g.optInt("period_months") == months) filtered.put(g)
                }
                groupCards(filtered, false, true)
            }
            .show()
    }

    private fun joinWithCode() {
        subpage = true
        screen("Join with code")
        val code = field(content, "Joining code or invite link")
        action(content, "Find group") {
            val raw = code.text.toString().trim()
            val uri = Uri.parse(raw)
            val id = if (uri.isHierarchical) uri.getQueryParameter("id") else null
            if (id != null && id.matches(Regex("[a-fA-F0-9-]{36}"))) {
                joinGroup(id, "Savings group")
                return@action
            }
            task(
                { repository.publicLoad("/api/search?q=${Uri.encode(raw)}").data },
                { data ->
                    val list = data.optJSONArray("results") ?: JSONArray()
                    val groups =
                        (0 until list.length())
                            .map { list.getJSONObject(it) }
                            .filter { it.optString("type") == "group" }
                    if (groups.isEmpty()) note("No group matches that code.")
                    for (g in groups) action(content, g.optString("name"), false) {
                        joinGroup(g.getString("id"), g.optString("name"))
                    }
                },
            )
        }
    }

    private fun selectDepositGroup() {
        requireLogin {
            subpage = true
            screen("Choose a savings group")
            load("/api/groups/mine") { saved ->
                val groups = saved.data.optJSONArray("groups") ?: JSONArray()
                if (groups.length() == 0)
                    emptyState("04-no-groups-empty", "Join a group before requesting a deposit.")
                for (i in 0 until groups.length()) {
                    val group = groups.getJSONObject(i)
                    action(content, groupName(group)) {
                        deposit(
                            group.optString("group_id").ifBlank { group.optString("id") },
                            groupName(group),
                        )
                    }
                }
            }
        }
    }

    private fun registration() {
        subpage = true
        screen(if (BuildConfig.ADMIN_APP) "Create account" else "__auth", false)
        if (!BuildConfig.ADMIN_APP) content = authPanel(true)
        if (BuildConfig.ADMIN_APP) note("Create your verified community admin account.")
        val phone =
            if (BuildConfig.ADMIN_APP) field(content, "Mobile number", InputType.TYPE_CLASS_PHONE)
            else phoneField(content, "Mobile Number", "7XXXXXXXX")
        if (!BuildConfig.ADMIN_APP)
            authHint(content, "Uganda numbers only, without country code.", 14)
        val password =
            if (BuildConfig.ADMIN_APP)
                field(
                    content,
                    "Password",
                    InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD,
                )
            else passwordField(content)
        if (!BuildConfig.ADMIN_APP) authHint(content, "Min. 4 Characters", 14)
        val first = field(content, "First Name")
        val last = field(content, "Last Name")
        val email =
            if (BuildConfig.ADMIN_APP)
                field(content, "Email", InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS)
            else null
        val location = field(content, if (BuildConfig.ADMIN_APP) "Address" else "Location")
        val nation =
            if (!BuildConfig.ADMIN_APP) field(content, "Nationality").apply { setText("Ugandan") }
            else null
        val nin = field(content, "National Identification Number")
        val confirm =
            if (BuildConfig.ADMIN_APP)
                field(
                    content,
                    "Confirm password",
                    InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD,
                )
            else null
        val pin =
            if (BuildConfig.ADMIN_APP)
                field(
                    content,
                    "4-digit approval PIN",
                    InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_VARIATION_PASSWORD,
                )
            else null
        var photo: String? = null
        if (BuildConfig.ADMIN_APP)
            action(content, "Take verification photo", false) {
                photoResult = {
                    photo = it
                    toast("Verification photo ready.")
                }
                try {
                    camera.launch(null)
                } catch (_: Exception) {
                    toast("This device needs a camera app for verification.")
                }
            }
        val terms =
            CheckBox(this).apply {
                text = "By creating an account you accept the Terms and Conditions"
                textSize = 12.5f
                setTextColor(if (authPage) Color.rgb(190, 190, 230) else ink)
            }
        content.addView(terms)
        action(content, "Read Terms and Conditions", false) {
            legalDialog("Terms and Conditions", "terms")
        }
        val submit = action(content, if (BuildConfig.ADMIN_APP) "Create account" else "JOIN NOW") {}
        submit.setOnClickListener {
            if (!terms.isChecked) {
                toast("Read and accept the terms to continue.")
                return@setOnClickListener
            }
            if (confirm != null && password.text.toString() != confirm.text.toString()) {
                toast("Passwords do not match.")
                return@setOnClickListener
            }
            if (BuildConfig.ADMIN_APP && photo == null) {
                toast("Take your verification photo first.")
                return@setOnClickListener
            }
            val body =
                JSONObject()
                    .put("firstName", first.text.toString())
                    .put("lastName", last.text.toString())
                    .put("phone", phone.text.toString())
                    .put("district", location.text.toString())
                    .put("address", location.text.toString())
                    .put("nationality", nation?.text.toString())
                    .put("nin", nin.text.toString())
                    .put("password", password.text.toString())
                    .put("termsAccepted", terms.isChecked)
            if (BuildConfig.ADMIN_APP)
                body
                    .put("email", email?.text.toString())
                    .put("pin", pin?.text.toString())
                    .put("photo", photo)
            submit.isEnabled = false
            task(
                { repository.register(body) },
                {
                    password.text.clear()
                    confirm?.text?.clear()
                    pin?.text?.clear()
                    navigate(if (BuildConfig.ADMIN_APP) "Home" else "Analytics")
                },
                {
                    submit.isEnabled = true
                    note(errorMessage(it))
                },
            )
        }
        if (!BuildConfig.ADMIN_APP) {
            authOr(content)
            val google = action(content, "", false) {}
            google.apply {
                contentDescription = "Continue with Google"
                val mark = getDrawable(R.drawable.google_mark)!!
                mark.setBounds(0, 0, dp(22), dp(22))
                setCompoundDrawables(mark, null, null, null)
                setPadding(dp(15), 0, dp(15), 0)
                layoutParams =
                    LinearLayout.LayoutParams(dp(52), dp(52)).apply {
                        gravity = Gravity.CENTER_HORIZONTAL
                    }
                setOnClickListener { googleSignIn(google, submit) }
            }
            label(content, "Already have an account? Log In", 13).apply {
                gravity = Gravity.CENTER
                setOnClickListener { loginScreen() }
            }
        } else action(content, "Already have an account? Log in", false) { loginScreen() }
    }

    private fun adminCommunity(community: JSONObject) {
        subpage = true
        screen(community.optString("name", "Community"))
        val id = community.getString("id")
        load("/api/admin/communities/$id/members") { saved ->
            val c = saved.data.optJSONObject("community") ?: community
            val hero = card(content, navy, 24)
            label(hero, c.optString("name"), 24, true).setTextColor(Color.WHITE)
            label(
                    hero,
                    "${c.optInt("total_members")} members · ${ugx(c.optDouble("total_saved"))} saved",
                    14,
                )
                .setTextColor(Color.WHITE)
            val code = c.optString("join_code")
            if (code.isNotBlank() && code != "null")
                action(content, "Share joining code: $code", false) { share(code) }
            action(content, "Register Member") { registerMember(id) }
            section("Members")
            val members = saved.data.optJSONArray("members") ?: JSONArray()
            if (members.length() == 0) note("No members registered yet.")
            for (i in 0 until members.length()) {
                val m = members.getJSONObject(i)
                menu(
                    "profile",
                    m.optString("display_name"),
                    "${ugx(m.optDouble("total_savings"))} saved · ${m.optString("username")}",
                ) {
                    adminMember(m.getString("id"))
                }
            }
        }
    }

    private fun adminMember(id: String) {
        subpage = true
        screen("Member savings")
        load("/api/admin/members/$id") { saved ->
            val d = saved.data
            val member = d.getJSONObject("member")
            val c = card(content, navy, 24)
            label(c, member.optString("display_name"), 25, true).setTextColor(Color.WHITE)
            label(c, "@${member.optString("username")} · ${member.optString("community_name")}", 13)
                .setTextColor(Color.WHITE)
            label(c, ugx(member.optDouble("total_savings")), 32, true).setTextColor(Color.WHITE)
            progress(c, member.optDouble("pct_reached"), true)
            label(
                content,
                "Amount to stay on track: ${ugx(d.optDouble("amountOnTrackGap"))}",
                16,
                true,
            )
            val groups = d.optJSONArray("groups") ?: JSONArray()
            if (groups.length() > 0)
                action(content, "Record received deposit") {
                    manualDeposit(id, member.optString("display_name"), groups)
                }
            section("Savings groups")
            groupCards(groups, false)
            section("Transactions")
            val tx = d.optJSONArray("transactions") ?: JSONArray()
            if (tx.length() == 0) note("No transactions to show.")
            for (i in 0 until tx.length()) {
                val t = tx.getJSONObject(i)
                val card = card()
                label(card, ugx(t.optDouble("amount")), 21, true)
                label(
                    card,
                    "${t.optString("payment_method")} · ${t.optString("status")} · ${shortDate(t.optString("created_at"))}",
                    13,
                )
            }
        }
    }

    private fun registerMember(selectedCommunity: String? = null) {
        screen("Register Member")
        subpage = selectedCommunity != null
        if (store.session() == null) {
            emptyState("12-complete-your-profile", "Log in to register members.")
            action(content, "Log in") { loginScreen() }
            return
        }
        load("/api/admin/communities") { saved ->
            val communities = saved.data.optJSONArray("communities") ?: JSONArray()
            if (communities.length() == 0) {
                note("Create a private community before registering a member.")
                action(content, "Create community") { createCommunity(true) }
                return@load
            }
            val first = field(content, "First name")
            val last = field(content, "Last name")
            val username = field(content, "Username")
            val phone = field(content, "Telephone (optional)", InputType.TYPE_CLASS_PHONE)
            val nin = field(content, "National Identification Number (NIN)")
            val password =
                field(
                    content,
                    "Member password",
                    InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD,
                )
            val confirm =
                field(
                    content,
                    "Confirm password",
                    InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD,
                )
            val community =
                select(
                    content,
                    "Community",
                    (0 until communities.length()).map {
                        communities.getJSONObject(it).optString("name")
                    },
                )
            if (selectedCommunity != null)
                for (i in 0 until communities.length()) if (
                    communities.getJSONObject(i).optString("id") == selectedCommunity
                )
                    community.setSelection(i)
            val period =
                select(
                    content,
                    "Period",
                    listOf("2 months", "3 months", "5 months", "8 months", "12 months"),
                )
            val goal = field(content, "Savings amount (UGX)", InputType.TYPE_CLASS_NUMBER)
            val deposited =
                field(content, "Already deposited (UGX)", InputType.TYPE_CLASS_NUMBER).apply {
                    setText("0")
                }
            val daily = field(content, "Daily rate (optional)", InputType.TYPE_CLASS_NUMBER)
            val pin =
                field(
                    content,
                    "Your approval PIN",
                    InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_VARIATION_PASSWORD,
                )
            action(content, "Review member registration") {
                val value = Money.positiveUgx(goal.text.toString())
                if (value == null) {
                    toast("Enter a positive savings goal.")
                    return@action
                }
                val prior = deposited.text.toString().toLongOrNull()
                if (prior == null || prior < 0 || prior > value) {
                    toast("Already deposited must be between zero and the savings goal.")
                    return@action
                }
                val body =
                    JSONObject()
                        .put("firstName", first.text.toString())
                        .put("lastName", last.text.toString())
                        .put("username", username.text.toString())
                        .put("phone", phone.text.toString())
                        .put("nin", nin.text.toString())
                        .put("password", password.text.toString())
                        .put("confirmPassword", confirm.text.toString())
                        .put(
                            "communityId",
                            communities
                                .getJSONObject(community.selectedItemPosition)
                                .getString("id"),
                        )
                        .put("periodMonths", listOf(2, 3, 5, 8, 12)[period.selectedItemPosition])
                        .put("goalAmount", value)
                        .put("alreadyDeposited", prior)
                        .put("dailyRate", daily.text.toString().toLongOrNull() ?: 0)
                        .put("pin", pin.text.toString())
                AlertDialog.Builder(this)
                    .setTitle("Register this member?")
                    .setMessage(
                        "Create ${first.text} ${last.text}'s account and record ${ugx(prior.toDouble())} already received? Only confirm money you physically received."
                    )
                    .setNegativeButton("Cancel", null)
                    .setPositiveButton("Register") { _, _ ->
                        password.text.clear()
                        confirm.text.clear()
                        pin.text.clear()
                        write(
                            "/api/admin/members",
                            body,
                            "Member registered by the server.",
                            "Communities",
                        )
                    }
                    .show()
            }
        }
    }

    private fun manualDeposit(memberId: String, name: String, groups: JSONArray) {
        subpage = true
        screen("Record received deposit")
        label(content, name, 22, true)
        val group =
            select(
                content,
                "Savings group",
                (0 until groups.length()).map { groupName(groups.getJSONObject(it)) },
            )
        val amount = field(content, "Amount received (UGX)", InputType.TYPE_CLASS_NUMBER)
        val pin =
            field(
                content,
                "Approval PIN",
                InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_VARIATION_PASSWORD,
            )
        val received =
            CheckBox(this).apply {
                text = "I confirm I have physically received this payment"
                setTextColor(ink)
            }
        content.addView(received)
        action(content, "Review deposit") {
            val value = Money.positiveUgx(amount.text.toString())
            if (value == null || !received.isChecked) {
                toast("Enter an amount and confirm receipt.")
                return@action
            }
            val body =
                JSONObject()
                    .put(
                        "groupId",
                        groups.getJSONObject(group.selectedItemPosition).getString("group_id"),
                    )
                    .put("amount", value)
                    .put("pin", pin.text.toString())
                    .put("acknowledged", true)
            AlertDialog.Builder(this)
                .setTitle("Credit received cash?")
                .setMessage(
                    "Credit ${ugx(value.toDouble())} to $name? This changes the live ledger."
                )
                .setNegativeButton("Cancel", null)
                .setPositiveButton("Confirm receipt") { _, _ ->
                    pin.text.clear()
                    write(
                        "/api/admin/members/$memberId/deposits",
                        body,
                        "Received deposit recorded by the server.",
                        "History",
                    )
                }
                .show()
        }
    }

    private fun changePin() {
        subpage = true
        screen("Change approval PIN")
        val old =
            field(
                content,
                "Current PIN",
                InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_VARIATION_PASSWORD,
            )
        val next =
            field(
                content,
                "New 4-digit PIN",
                InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_VARIATION_PASSWORD,
            )
        val confirm =
            field(
                content,
                "Confirm new PIN",
                InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_VARIATION_PASSWORD,
            )
        action(content, "Change PIN") {
            val value = next.text.toString()
            if (!value.matches(Regex("[0-9]{4}")) || value != confirm.text.toString()) {
                toast("Enter and confirm a four-digit PIN.")
                return@action
            }
            change(
                "/api/admin/pin",
                JSONObject().put("pin", old.text.toString()).put("newPin", value),
            ) {
                old.text.clear()
                next.text.clear()
                confirm.text.clear()
                navigate("Profile")
            }
        }
    }

    private fun change(
        path: String,
        body: JSONObject,
        method: String = "POST",
        done: (JSONObject) -> Unit,
    ) {
        if (!online()) {
            toast("This action requires internet.")
            return
        }
        // Disable every submit control until this write is confirmed; never automatically retry.
        val ticket = generation
        setControls(content, false)
        task(
            { repository.change(path, body, method) },
            { result ->
                if (generation == ticket) setControls(content, true)
                done(result)
            },
            { error ->
                if (generation == ticket) setControls(content, true)
                if (error is ApiException && error.status == 401) {
                    store.clear()
                    loginScreen(error.message)
                } else note(errorMessage(error))
            },
        )
    }

    private fun setControls(group: android.view.ViewGroup, enabled: Boolean) {
        for (i in 0 until group.childCount) {
            val child = group.getChildAt(i)
            if (child is Button || child is EditText || child is Spinner || child is CheckBox)
                child.isEnabled = enabled
            if (child is android.view.ViewGroup) setControls(child, enabled)
        }
    }

    private fun load(path: String, public: Boolean = false, render: (Snapshot) -> Unit) {
        val status = label(content, "Loading…", 14)
        task(
            {
                if (public && (path != "/api/home" || store.session() == null))
                    repository.publicLoad(path)
                else repository.load(path)
            },
            { saved ->
                content.removeView(status)
                lastSnapshotOffline = saved.offline
                refreshConnection()
                if (saved.offline)
                    note("Saved ${formatTime(saved.savedAt)} · Values may have changed.")
                render(saved)
            },
            { error ->
                content.removeView(status)
                if (error is ApiException && error.status == 401) {
                    loginScreen(error.message)
                    return@task
                }
                emptyState(
                    if (error is IOException) "16-no-connection" else "17-no-results-found",
                    errorMessage(error),
                )
                action(content, "Try again", false) { navigate(tab) }
            },
        )
    }

    private fun authPanel(joining: Boolean): LinearLayout {
        val panel =
            card(content, Color.rgb(26, 26, 151), 16).apply {
                setPadding(dp(16), dp(16), dp(16), dp(24))
                background = round(Color.rgb(26, 26, 151), 16, Color.argb(56, 255, 255, 255))
                (layoutParams as LinearLayout.LayoutParams).apply {
                    topMargin = 0
                    bottomMargin = 0
                }
            }
        val tabs = row(panel)
        for ((index, title) in listOf("Log In", "Join Now").withIndex()) {
            val selected = joining == (index == 1)
            val item = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
            tabs.addView(item, LinearLayout.LayoutParams(0, dp(47), 1f))
            val text =
                label(item, title, 15, true).apply {
                    gravity = Gravity.CENTER
                    setPadding(0, 0, 0, 0)
                    setTextColor(if (selected) Color.WHITE else Color.argb(140, 255, 255, 255))
                }
            text.layoutParams = LinearLayout.LayoutParams(-1, 0, 1f)
            item.addView(
                View(this).apply {
                    setBackgroundColor(if (selected) Color.WHITE else Color.argb(51, 255, 255, 255))
                },
                LinearLayout.LayoutParams(-1, dp(if (selected) 3 else 2)),
            )
            item.setOnClickListener { if (index == 1) registration() else loginScreen() }
        }
        panel.addView(Space(this), LinearLayout.LayoutParams(1, dp(20)))
        return panel
    }

    private fun authHint(parent: LinearLayout, value: String, bottom: Int = 0) {
        label(parent, value, 13).apply {
            setTextColor(Color.argb(140, 255, 255, 255))
            setPadding(0, dp(6), 0, dp(bottom))
        }
    }

    private fun authOr(parent: LinearLayout) {
        val r = row(parent)
        r.layoutParams =
            LinearLayout.LayoutParams(-1, dp(18)).apply {
                topMargin = dp(18)
                bottomMargin = dp(14)
            }
        fun line() {
            r.addView(
                View(this).apply { setBackgroundColor(Color.argb(38, 255, 255, 255)) },
                LinearLayout.LayoutParams(0, dp(1), 1f),
            )
        }
        line()
        label(r, "or", 12).apply {
            gravity = Gravity.CENTER
            setPadding(0, 0, 0, 0)
            layoutParams = LinearLayout.LayoutParams(dp(36), -1)
        }
        line()
    }

    private fun phoneField(parent: LinearLayout, title: String, hintText: String): EditText {
        val edit = field(parent, title, InputType.TYPE_CLASS_TEXT).apply { hint = hintText }
        parent.removeView(edit)
        val r = row(parent).apply { background = round(Color.WHITE, 6, lineColor) }
        r.layoutParams = LinearLayout.LayoutParams(-1, dp(44)).apply { topMargin = dp(3) }
        label(r, "+256", 15, true).apply {
            setTextColor(Color.rgb(17, 17, 17))
            setPadding(dp(12), 0, dp(12), 0)
            gravity = Gravity.CENTER
            background = round(Color.rgb(249, 250, 253), 6)
            layoutParams = LinearLayout.LayoutParams(-2, -1)
        }
        edit.background = null
        r.addView(edit, LinearLayout.LayoutParams(0, -1, 1f))
        return edit
    }

    private fun passwordField(parent: LinearLayout): EditText {
        val edit =
            field(
                parent,
                "Password",
                InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD,
            )
        parent.removeView(edit)
        val r = row(parent).apply { background = round(Color.WHITE, 6, lineColor) }
        r.layoutParams = LinearLayout.LayoutParams(-1, dp(44)).apply { topMargin = dp(3) }
        edit.background = null
        r.addView(edit, LinearLayout.LayoutParams(0, -1, 1f))
        val show =
            label(r, "Show", 13, true).apply {
                setTextColor(navy)
                gravity = Gravity.CENTER
                setPadding(dp(8), 0, dp(12), 0)
                layoutParams = LinearLayout.LayoutParams(dp(60), -1)
                contentDescription = "Show password"
                isFocusable = true
            }
        show.setOnClickListener {
            val visible = edit.transformationMethod != null
            edit.transformationMethod =
                if (visible) null else PasswordTransformationMethod.getInstance()
            show.text = if (visible) "Hide" else "Show"
            show.contentDescription = if (visible) "Hide password" else "Show password"
            edit.setSelection(edit.text.length)
        }
        return edit
    }

    private fun accountRow(
        parent: LinearLayout,
        icon: String,
        title: String,
        click: () -> Unit,
    ): LinearLayout {
        val r =
            row(parent).apply {
                minimumHeight = dp(48)
                setPadding(dp(16), 0, dp(16), 0)
                contentDescription = title
                isFocusable = true
                setOnClickListener { click() }
            }
        r.addView(
            BrandIcon(this, icon, if (dark) ink else Color.rgb(35, 39, 43)),
            LinearLayout.LayoutParams(dp(18), dp(18)),
        )
        label(r, title, 15).apply {
            setPadding(dp(14), dp(10), dp(8), dp(10))
            setTextColor(if (dark) ink else Color.rgb(17, 17, 17))
            layoutParams = LinearLayout.LayoutParams(0, -2, 1f)
        }
        return r
    }

    private fun accountAccordion(
        parent: LinearLayout,
        icon: String,
        title: String,
        links: List<Pair<String, String>>,
    ) {
        val body =
            LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                visibility = View.GONE
            }
        val r =
            accountRow(parent, icon, title) {
                body.visibility = if (body.visibility == View.GONE) View.VISIBLE else View.GONE
            }
        r.addView(BrandIcon(this, "down", muted), LinearLayout.LayoutParams(dp(14), dp(14)))
        parent.addView(body, LinearLayout.LayoutParams(-1, -2))
        for ((name, path) in links) label(body, name, 14).apply {
            setPadding(dp(48), dp(12), dp(12), dp(12))
            setOnClickListener { legalScreen(name, path) }
            isFocusable = true
        }
    }

    private fun row(parent: LinearLayout) =
        LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            parent.addView(this, LinearLayout.LayoutParams(-1, -2))
        }

    private fun messageBackground(radius: Int) =
        GradientDrawable(
                GradientDrawable.Orientation.TL_BR,
                if (dark) intArrayOf(ink, Color.rgb(247, 243, 235))
                else intArrayOf(navy, navy, Color.rgb(10, 10, 255)),
            )
            .apply { cornerRadius = dp(radius).toFloat() }

    private fun round(color: Int, radius: Int, border: Int? = null) =
        GradientDrawable().apply {
            setColor(color)
            cornerRadius = dp(radius).toFloat()
            if (border != null) setStroke(dp(1), border)
        }

    private fun card(
        parent: LinearLayout = content,
        color: Int = paper,
        radius: Int = 18,
    ): LinearLayout =
        LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(18), dp(16), dp(18), dp(16))
            background =
                round(color, radius, if (color == navy) Color.rgb(60, 60, 170) else lineColor)
            elevation = dp(if (color == navy) 8 else 3).toFloat()
            clipToPadding = false
            parent.addView(
                this,
                LinearLayout.LayoutParams(-1, -2).apply {
                    topMargin = dp(10)
                    bottomMargin = dp(6)
                },
            )
        }

    private fun label(
        parent: LinearLayout,
        value: String,
        size: Int = 16,
        bold: Boolean = false,
    ): TextView =
        TextView(this).apply {
            text = value
            textSize = size.toFloat()
            typeface = Typeface.create(font, if (bold) Typeface.BOLD else Typeface.NORMAL)
            setTextColor(
                if (authPage) {
                    if (size <= 14) Color.rgb(190, 190, 230) else Color.WHITE
                } else if (bold) ink
                else if (size <= 14) muted else if (dark) ink else Color.rgb(17, 17, 17)
            )
            setLineSpacing(dp(2).toFloat(), 1f)
            includeFontPadding = false
            setPadding(0, dp(5), 0, dp(5))
            parent.addView(this, LinearLayout.LayoutParams(-1, -2))
        }

    private fun section(title: String) {
        label(content, title, 19, true).setPadding(0, dp(22), 0, dp(6))
    }

    private fun field(
        parent: LinearLayout,
        title: String,
        type: Int = InputType.TYPE_CLASS_TEXT,
    ): EditText {
        val caption = label(parent, title, 13, true)
        if (authPage) caption.setTextColor(Color.rgb(219, 219, 244))
        return EditText(this).apply {
            id = View.generateViewId()
            caption.labelFor = id
            hint = title
            inputType = type
            isSingleLine = true
            isSaveEnabled = false
            textSize = 15f
            typeface = font
            setTextColor(navy)
            setHintTextColor(Color.rgb(141, 147, 163))
            background = round(Color.WHITE, 6, lineColor)
            setPadding(dp(13), 0, dp(13), 0)
            parent.addView(
                this,
                LinearLayout.LayoutParams(-1, dp(if (authPage) 44 else 48)).apply {
                    topMargin = dp(3)
                    bottomMargin = dp(9)
                },
            )
        }
    }

    private fun select(parent: LinearLayout, title: String, options: List<String>): Spinner {
        label(parent, title, 13, true)
        return Spinner(this).apply {
            adapter =
                ArrayAdapter(
                    this@MainActivity,
                    android.R.layout.simple_spinner_dropdown_item,
                    options,
                )
            background = round(Color.WHITE, 8, lineColor)
            parent.addView(
                this,
                LinearLayout.LayoutParams(-1, dp(48)).apply { bottomMargin = dp(8) },
            )
        }
    }

    private fun action(
        parent: LinearLayout,
        title: String,
        primary: Boolean = true,
        click: () -> Unit,
    ): Button =
        Button(this).apply {
            text = title
            isAllCaps = false
            textSize = if (authPage) 15.2f else 14f
            typeface = Typeface.create(font, Typeface.BOLD)
            val inverse = authPage && primary
            setTextColor(
                if (inverse) navy else if (primary) Color.WHITE else if (authPage) navy else ink
            )
            background =
                round(
                    if (inverse || authPage) Color.WHITE else if (primary) navy else paper,
                    if (authPage) 6 else 12,
                    if (primary) null else lineColor,
                )
            setPadding(dp(12), dp(8), dp(12), dp(8))
            minimumHeight = dp(49)
            minHeight = dp(49)
            minimumWidth = 0
            minWidth = 0
            stateListAnimator = null
            isFocusable = true
            parent.addView(
                this,
                LinearLayout.LayoutParams(-1, -2).apply {
                    topMargin = dp(10)
                    bottomMargin = dp(4)
                },
            )
            setOnClickListener { click() }
        }

    private fun chip(
        parent: LinearLayout,
        title: String,
        active: Boolean = true,
        compact: Boolean = false,
        click: () -> Unit,
    ) {
        val text =
            TextView(this).apply {
                this.text = title
                textSize = 12f
                typeface = Typeface.create(font, Typeface.BOLD)
                gravity = Gravity.CENTER
                setTextColor(if (active) Color.WHITE else ink)
                background = round(if (active) navy else paper, 10, lineColor)
                setPadding(dp(12), dp(10), dp(12), dp(10))
                setOnClickListener { click() }
                isFocusable = true
            }
        parent.addView(
            text,
            LinearLayout.LayoutParams(if (compact) -2 else 0, -2, if (compact) 0f else 1f).apply {
                setMargins(dp(3), dp(6), dp(3), dp(6))
            },
        )
    }

    private fun legalDialog(title: String, name: String) {
        val text =
            TextView(this).apply {
                this.text =
                    try {
                        assets.open("legal/$name.txt").bufferedReader().use { it.readText() }
                    } catch (_: IOException) {
                        "This page is unavailable."
                    }
                textSize = 15f
                typeface = font
                setTextColor(Color.rgb(25, 25, 35))
                setPadding(dp(20), dp(16), dp(20), dp(16))
            }
        val scroll = ScrollView(this).apply { addView(text) }
        AlertDialog.Builder(this)
            .setTitle(title)
            .setView(scroll)
            .setPositiveButton("Close", null)
            .show()
    }

    private fun legalMenu(help: Boolean) {
        val items =
            if (help)
                listOf(
                    "Help" to "help",
                    "Deposit" to "deposit",
                    "Rules" to "rules",
                    "Responsible saving" to "responsible-saving",
                )
            else
                listOf(
                    "About" to "about",
                    "Privacy policy" to "privacy",
                    "Cookies policy" to "cookies",
                    "Terms and Conditions" to "terms",
                    "News" to "news",
                )
        AlertDialog.Builder(this)
            .setTitle(if (help) "Help Center" else "More on KibbiSave")
            .setItems(items.map { it.first }.toTypedArray()) { _, index ->
                legalScreen(items[index].first, items[index].second)
            }
            .show()
    }

    private fun legalScreen(title: String, name: String) {
        subpage = true
        screen(title)
        try {
            label(
                content,
                assets.open("legal/$name.txt").bufferedReader().use { it.readText() },
                15,
            )
        } catch (_: IOException) {
            note("This page is unavailable offline.")
            action(content, "Open website", false) {
                openWebsite("${BuildConfig.API_URL}/legal/$name.html")
            }
        }
    }

    private fun menu(icon: String, title: String, subtitle: String, click: () -> Unit) {
        val c = card()
        val r = row(c)
        r.addView(BrandIcon(this, icon, ink), LinearLayout.LayoutParams(dp(27), dp(27)))
        val text =
            LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                setPadding(dp(13), 0, dp(8), 0)
            }
        r.addView(text, LinearLayout.LayoutParams(0, -2, 1f))
        label(text, title, 16, true)
        if (subtitle.isNotBlank()) label(text, subtitle, 12)
        r.addView(BrandIcon(this, "arrow", muted), LinearLayout.LayoutParams(dp(18), dp(18)))
        c.setOnClickListener { click() }
        c.contentDescription = title
        c.isFocusable = true
    }

    private fun progress(parent: LinearLayout, percent: Double, inverse: Boolean = false) {
        val bar =
            WebsiteProgress(
                this,
                percent,
                if (inverse) Color.WHITE else ink,
                if (inverse) Color.argb(46, 255, 255, 255)
                else if (dark) lineColor else Color.rgb(238, 240, 248),
                inverse,
            )
        parent.addView(
            bar,
            LinearLayout.LayoutParams(-1, dp(if (inverse) 10 else 8)).apply {
                topMargin = dp(9)
                bottomMargin = dp(9)
            },
        )
    }

    private fun divider(parent: LinearLayout, color: Int = lineColor) {
        parent.addView(
            View(this).apply { setBackgroundColor(color) },
            LinearLayout.LayoutParams(-1, dp(1)).apply {
                topMargin = dp(8)
                bottomMargin = dp(12)
            },
        )
    }

    private fun avatar(parent: LinearLayout, name: String, size: Int, picture: String? = null) {
        parent.addView(
            AvatarView(this, name, picture, dp(size), font),
            LinearLayout.LayoutParams(dp(size), dp(size)),
        )
    }

    private fun illustration(parent: LinearLayout, name: String, height: Int) {
        val image =
            ImageView(this).apply {
                scaleType = ImageView.ScaleType.FIT_CENTER
                contentDescription = name.substringAfter('-').replace('-', ' ')
                try {
                    setImageDrawable(
                        android.graphics.drawable.Drawable.createFromStream(
                            assets.open("illustrations/$name.png"),
                            null,
                        )
                    )
                } catch (_: Exception) {
                    visibility = View.GONE
                }
            }
        parent.addView(
            image,
            LinearLayout.LayoutParams(-1, dp(height)).apply {
                gravity = Gravity.CENTER
                topMargin = dp(5)
                bottomMargin = dp(6)
            },
        )
    }

    private fun emptyState(asset: String, message: String) {
        val c = card()
        illustration(c, asset, 150)
        label(c, message, 16).gravity = Gravity.CENTER
    }

    private fun alertCard(title: String, body: String) {
        val c = card()
        label(c, title, 17, true)
        label(c, body, 13)
    }

    private fun footer() {
        divider(content)
        label(content, "Stay up to date", 12, true)
        val r = row(content)
        for ((name, url) in
            listOf(
                "Facebook" to "https://facebook.com/",
                "X" to "https://x.com/",
                "Instagram" to "https://instagram.com/",
            )) chip(r, name, false) { openWebsite(url) }
    }

    private fun share(value: String) {
        startActivity(
            Intent.createChooser(
                Intent(Intent.ACTION_SEND).apply {
                    type = "text/plain"
                    putExtra(Intent.EXTRA_TEXT, value)
                },
                "Share",
            )
        )
    }

    private fun copy(value: String) {
        (getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager).setPrimaryClip(
            ClipData.newPlainText("KibbiSave", value)
        )
        toast("Copied.")
    }

    private fun groupName(g: JSONObject): String {
        for (k in listOf("group_name", "name", "code")) {
            val v = g.optString(k)
            if (v.isNotBlank() && v != "null") return v
        }
        return "${g.optInt("period_months")} month group"
    }

    private fun shortDate(raw: String) =
        try {
            val p = java.text.SimpleDateFormat("yyyy-MM-dd", Locale.US)
            DateFormat.getDateInstance(DateFormat.MEDIUM, Locale.UK).format(p.parse(raw.take(10))!!)
        } catch (_: Exception) {
            "—"
        }

    private fun pct(value: Double) =
        String.format(Locale.UK, "%.2f", if (value.isFinite()) value else 0.0)

    private fun encodePhoto(bitmap: Bitmap): String {
        val max = maxOf(bitmap.width, bitmap.height)
        val scaled =
            if (max > 900)
                Bitmap.createScaledBitmap(
                    bitmap,
                    bitmap.width * 900 / max,
                    bitmap.height * 900 / max,
                    true,
                )
            else bitmap
        val out = java.io.ByteArrayOutputStream()
        scaled.compress(Bitmap.CompressFormat.JPEG, 80, out)
        return "data:image/jpeg;base64," +
            android.util.Base64.encodeToString(out.toByteArray(), android.util.Base64.NO_WRAP)
    }

    private fun note(value: String) {
        label(content, value, 14)
    }

    private fun toast(value: String) {
        Toast.makeText(this, value, Toast.LENGTH_LONG).show()
    }

    private fun dp(value: Int) = (value * resources.displayMetrics.density).toInt()

    private fun ugx(value: Double) =
        if (value.isFinite()) "UGX " + NumberFormat.getIntegerInstance(Locale.UK).format(value)
        else "Not available"

    private fun formatTime(value: Long) =
        DateFormat.getDateTimeInstance(DateFormat.SHORT, DateFormat.SHORT).format(Date(value))

    private fun googleSignIn(googleButton: Button, passwordButton: Button) {
        if (!online()) {
            toast("Sign-in requires internet.")
            return
        }
        googleButton.isEnabled = false
        passwordButton.isEnabled = false
        val ticket = generation
        fun failed(error: Exception) {
            if (isDestroyed || generation != ticket) return
            googleButton.isEnabled = true
            passwordButton.isEnabled = true
            if (error !is GetCredentialCancellationException)
                note(
                    when (error) {
                        is GetCredentialException ->
                            "Google sign-in is unavailable. Check that a Google account is on this device and this app is registered in Google Cloud."
                        else -> errorMessage(error)
                    }
                )
        }
        task(
            { repository.googleChallenge() },
            { flow ->
                try {
                    val option =
                        GetSignInWithGoogleOption.Builder(flow.getString("clientId"))
                            .setNonce(flow.getString("nonce"))
                            .build()
                    val request = GetCredentialRequest.Builder().addCredentialOption(option).build()
                    CredentialManager.create(this)
                        .getCredentialAsync(
                            this,
                            request,
                            null,
                            Executor { main.post(it) },
                            object :
                                CredentialManagerCallback<
                                    GetCredentialResponse,
                                    GetCredentialException,
                                > {
                                override fun onResult(result: GetCredentialResponse) {
                                    if (isDestroyed || generation != ticket) return
                                    try {
                                        val credential = result.credential
                                        check(
                                            credential is CustomCredential &&
                                                credential.type ==
                                                    GoogleIdTokenCredential
                                                        .TYPE_GOOGLE_ID_TOKEN_CREDENTIAL
                                        ) {
                                            "Google did not return a sign-in credential."
                                        }
                                        val token =
                                            GoogleIdTokenCredential.createFrom(credential.data)
                                                .idToken
                                        task(
                                            {
                                                repository.googleLogin(
                                                    token,
                                                    flow.getString("challenge"),
                                                )
                                            },
                                            { navigate("Home") },
                                            { failed(it) },
                                        )
                                    } catch (error: Exception) {
                                        failed(error)
                                    }
                                }

                                override fun onError(e: GetCredentialException) {
                                    failed(e)
                                }
                            },
                        )
                } catch (error: Exception) {
                    failed(error)
                }
            },
            { failed(it) },
        )
    }

    private fun approve(item: JSONObject) {
        if (!online()) {
            toast("Approval requires internet.")
            return
        }
        val form =
            LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                setPadding(dp(20), 0, dp(20), 0)
            }
        label(
            form,
            "Verify you received ${ugx(item.optDouble("amount"))} from ${item.optString("display_name")}.",
            16,
        )
        val acknowledged =
            CheckBox(this).apply { text = "I have independently verified receipt of this payment" }
        form.addView(acknowledged)
        val pin =
            field(
                form,
                "4-digit approval PIN",
                InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_VARIATION_PASSWORD,
            )
        pin.isSaveEnabled = false
        val dialog =
            AlertDialog.Builder(this)
                .setTitle("Approve deposit")
                .setView(form)
                .setNegativeButton("Cancel", null)
                .setPositiveButton("Approve", null)
                .create()
        dialog.setOnShowListener {
            dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener {
                val secret = pin.text.toString()
                if (!acknowledged.isChecked || !secret.matches(Regex("[0-9]{4}"))) {
                    toast("Verify receipt and enter your 4-digit PIN.")
                    return@setOnClickListener
                }
                pin.text.clear()
                dialog.dismiss()
                write(
                    "/api/admin/approvals/${item.getString("id")}/approve",
                    JSONObject().put("pin", secret).put("acknowledged", true),
                    "Deposit approved by the server.",
                    "Approvals",
                )
            }
        }
        dialog.show()
    }

    private fun deposit(groupId: String, name: String) {
        screen("Request a deposit")
        label(content, name, 20, true)
        note(
            "This sends a deposit request to your community admin. It does not transfer mobile money or confirm a payment."
        )
        if (store.pendingWrite() != null) {
            unresolvedWrite()
            return
        }
        val amount = field(content, "Amount (whole UGX)", InputType.TYPE_CLASS_NUMBER)
        val phone = field(content, "Mobile money phone (optional)", InputType.TYPE_CLASS_PHONE)
        val provider =
            Spinner(this).apply {
                adapter =
                    ArrayAdapter(
                        this@MainActivity,
                        android.R.layout.simple_spinner_dropdown_item,
                        listOf("MTN Mobile Money", "Airtel Money", "Cash"),
                    )
            }
        label(content, "Payment method", 14, true)
        content.addView(provider)
        action(content, "Review request") {
                val value = Money.positiveUgx(amount.text.toString())
                if (value == null) {
                    toast("Enter a positive whole UGX amount.")
                    return@action
                }
                val method = listOf("mtn_momo", "airtel", "cash")[provider.selectedItemPosition]
                val body =
                    JSONObject()
                        .put("group_id", groupId)
                        .put("amount", value)
                        .put("provider", method)
                        .put("phone", phone.text.toString().trim())
                AlertDialog.Builder(this)
                    .setTitle("Send request?")
                    .setMessage(
                        "Request ${ugx(value.toDouble())} for $name? Your admin must confirm receipt before it counts as savings."
                    )
                    .setNegativeButton("Cancel", null)
                    .setPositiveButton("Send request") { _, _ ->
                        write(
                            "/api/deposits",
                            body,
                            "Deposit request submitted. It is not a confirmed payment.",
                            "History",
                        )
                    }
                    .show()
            }
            .isEnabled = online()
    }

    private fun joinGroup(id: String, name: String) {
        subpage = true
        screen("Join group")
        label(content, name, 23, true)
        val goal = field(content, "Total amount (UGX) *", InputType.TYPE_CLASS_NUMBER)
        val purpose = field(content, "What are you saving for?")
        val suggestion = field(content, "Suggest group name (max 10 characters)")
        val code = field(content, "Joining code (private groups)")
        val selected = mutableSetOf<Int>()
        var choices = JSONArray()
        val chooser = action(content, "Choose community (optional — up to 2)", false) {}
        task(
            {
                repository.publicLoad("/api/communities").data.optJSONArray("communities")
                    ?: JSONArray()
            },
            { list ->
                choices = list
                chooser.setOnClickListener {
                    val names = Array(list.length()) { list.getJSONObject(it).optString("name") }
                    val pending = selected.toMutableSet()
                    AlertDialog.Builder(this)
                        .setTitle("Choose up to two communities")
                        .setMultiChoiceItems(names, BooleanArray(names.size) { it in pending }) {
                            dialog,
                            which,
                            checked ->
                            if (checked && pending.size >= 2) {
                                (dialog as AlertDialog).listView.setItemChecked(which, false)
                                toast("Choose at most two communities.")
                            } else if (checked) pending.add(which) else pending.remove(which)
                        }
                        .setNegativeButton("Cancel", null)
                        .setPositiveButton("Choose") { _, _ ->
                            selected.clear()
                            selected.addAll(pending)
                            chooser.text =
                                if (selected.isEmpty()) "Choose community (optional — up to 2)"
                                else selected.joinToString(", ") { names[it] }
                        }
                        .show()
                }
            },
        )
        action(content, "Continue to deposit") {
            val amount = Money.positiveUgx(goal.text.toString())
            if (amount == null) {
                toast("Enter a positive savings goal.")
                return@action
            }
            if (suggestion.text.length > 10) {
                toast("Use at most ten characters for the group name.")
                return@action
            }
            val communityIds = JSONArray()
            for (index in selected) communityIds.put(choices.getJSONObject(index).getString("id"))
            val body =
                JSONObject()
                    .put("goal_amount", amount)
                    .put("saving_for", purpose.text.toString())
                    .put("suggest_name", suggestion.text.toString().trim())
                    .put("community_ids", communityIds)
                    .put("code", code.text.toString().trim())
            change("/api/groups/$id/join", body) { deposit(id, name) }
        }
    }

    private fun createGroup() {
        subpage = true
        screen("Create private group")
        note("Share the link with friends so they can join and save together.")
        val name = field(content, "Group name * (max 10 characters)")
        val period =
            select(content, "Period *", listOf("3 months", "5 months", "8 months", "12 months"))
        val open =
            CheckBox(this).apply {
                text = "Anyone can join group"
                isChecked = true
                setTextColor(ink)
            }
        content.addView(open)
        note("On: anyone with the link joins. Off: they must enter your joining code.")
        action(content, "Create group") {
            val value = name.text.toString().trim()
            if (value.isBlank() || value.length > 10) {
                toast("Use a name with 1–10 characters.")
                return@action
            }
            change(
                "/api/groups",
                JSONObject()
                    .put("name", value)
                    .put("period_months", listOf(3, 5, 8, 12)[period.selectedItemPosition])
                    .put("anyone_can_join", open.isChecked),
            ) { result ->
                screen("Group created — share to finish")
                subpage = true
                val group = result.getJSONObject("group")
                val path = result.getString("share_link")
                val url = BuildConfig.API_URL + path
                val c = card()
                label(c, "Invite link", 13, true)
                label(c, url, 14)
                label(c, "Joining code: ${result.optString("joining_code")}", 20, true)
                val next =
                    action(content, "Continue — join my group") {
                        joinGroup(group.getString("id"), value)
                    }
                next.isEnabled = false
                action(c, "Share") {
                    share(url)
                    next.isEnabled = true
                }
                action(c, "Copy link", false) {
                    copy(url)
                    next.isEnabled = true
                }
                note("Share or copy the invite link to continue — a group needs members.")
            }
        }
    }

    private fun write(path: String, body: JSONObject, success: String, returnTab: String) {
        if (!online()) {
            toast("This action requires internet. Nothing has been queued.")
            return
        }
        screen("Sending request…")
        note(
            "Please wait for the server. Do not submit this action elsewhere while it is in progress."
        )
        task(
            { repository.post(path, body) },
            { result ->
                navigate(returnTab)
                val receipt =
                    if (path == "/api/deposits" && result.optBoolean("pending")) {
                        "Request submitted and awaiting admin approval. No mobile-money transfer has been made by this app.\n\nRequest: " +
                            result.optJSONObject("request")?.optString("id", "See your admin")
                    } else success
                AlertDialog.Builder(this)
                    .setTitle("Server confirmed")
                    .setMessage(receipt)
                    .setPositiveButton("OK", null)
                    .show()
            },
            { error ->
                screen("Request could not be confirmed")
                note(errorMessage(error))
                if (store.pendingWrite() != null) unresolvedWrite()
                action(content, "Return to $returnTab") { navigate(returnTab) }
            },
        )
    }

    private fun unresolvedWrite() {
        note(
            "A previous payment action has not been confirmed on this device. Do not resend it until you check live history or approvals with your admin."
        )
        action(content, "I have checked the server result", false) {
            AlertDialog.Builder(this)
                .setTitle("Enable another payment action?")
                .setMessage(
                    "Only continue after checking the live result. Clearing this reminder does not cancel or repeat the earlier request."
                )
                .setNegativeButton("Keep reminder", null)
                .setPositiveButton("I checked") { _, _ ->
                    if (!online()) toast("Reconnect and check the server first.")
                    else task({ store.resolveWrite() }, { navigate(tab) })
                }
                .show()
        }
    }

    private fun <T> task(
        work: () -> T,
        success: (T) -> Unit,
        failure: (Exception) -> Unit = { note(errorMessage(it)) },
    ) {
        val ticket = generation
        app.executor.execute {
            val result: Result<T> =
                try {
                    Result.success(work())
                } catch (error: Exception) {
                    Result.failure(error)
                }
            main.post {
                if (!isDestroyed && !isFinishing && generation == ticket) {
                    result.fold(success, { failure(it as? Exception ?: Exception(it)) })
                }
            }
        }
    }

    private fun errorMessage(error: Exception): String =
        when (error) {
            is IOException ->
                "Could not connect. No usable saved data is available for this screen. Reconnect and refresh. Payment requests are never queued."
            else -> error.message?.take(240) ?: "Something went wrong. Please try again."
        }

    private fun openWebsite(url: String) {
        try {
            startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
        } catch (_: android.content.ActivityNotFoundException) {
            toast("Open $url in a browser to manage your account.")
        }
    }
}
