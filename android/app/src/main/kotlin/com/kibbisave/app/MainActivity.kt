package com.kibbisave.app

import android.app.Activity
import android.app.AlertDialog
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.net.Uri
import android.os.Bundle
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.text.InputType
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.*
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.text.DateFormat
import java.text.NumberFormat
import java.util.Date
import java.util.Locale

/** Native Android Views written in Kotlin. No website rendering or embedded browser. */
class MainActivity : Activity() {
    private val app get() = application as NativeApplication
    private val store get() = app.store
    private val repository get() = app.repository
    private val main = Handler(Looper.getMainLooper())
    private val navy = Color.rgb(20, 43, 87)
    private val muted = Color.rgb(88, 103, 129)
    private val accent get() = if (BuildConfig.ADMIN_APP) Color.rgb(142, 86, 0) else Color.rgb(0, 0, 139)
    private lateinit var root: LinearLayout
    private lateinit var content: LinearLayout
    private lateinit var connectionLabel: TextView
    private lateinit var connectivity: ConnectivityManager
    private var generation = 0
    private var tab = "Home"
    private var lastSnapshotOffline = false
    private val networkCallback = object : ConnectivityManager.NetworkCallback() {
        override fun onAvailable(network: Network) = refreshConnection()
        override fun onLost(network: Network) = refreshConnection()
        override fun onCapabilitiesChanged(network: Network, capabilities: NetworkCapabilities) = refreshConnection()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
        connectivity = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        connectivity.registerNetworkCallback(NetworkRequest.Builder()
            .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET).build(), networkCallback)
        if (Build.VERSION.SDK_INT >= 33) {
            onBackInvokedDispatcher.registerOnBackInvokedCallback(android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT) { goBack() }
        }
        if (store.session() == null) loginScreen() else navigate(savedInstanceState?.getString("tab") ?: "Home")
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

    @Deprecated("Platform back navigation")
    override fun onBackPressed() {
        goBack()
    }

    private fun goBack() {
        if (store.session() != null && tab != "Home") navigate("Home") else finish()
    }

    private fun online(): Boolean = connectivity.activeNetwork?.let {
        connectivity.getNetworkCapabilities(it)?.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
    } == true

    private fun refreshConnection() {
        main.post {
            if (!isDestroyed && ::connectionLabel.isInitialized) {
                connectionLabel.text = when {
                    !online() -> "Offline · read-only saved data"
                    lastSnapshotOffline -> "Saved data · tap Refresh to update"
                    else -> "Connected · native Android"
                }
                connectionLabel.setTextColor(if (!online() || lastSnapshotOffline) accent else muted)
            }
        }
    }

    private fun screen(title: String, signedIn: Boolean = store.session() != null) {
        generation++
        lastSnapshotOffline = false
        root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.rgb(245, 247, 252))
            setPadding(dp(20), dp(12), dp(20), dp(8))
            setOnApplyWindowInsetsListener { view, insets ->
                view.setPadding(dp(20) + insets.systemWindowInsetLeft,
                    dp(12) + insets.systemWindowInsetTop, dp(20) + insets.systemWindowInsetRight,
                    dp(8) + insets.systemWindowInsetBottom)
                insets
            }
        }
        label(root, getString(R.string.app_name), 23, true)
        connectionLabel = label(root, "", 12)
        refreshConnection()
        val scroll = ScrollView(this).apply { isFillViewport = true }
        content = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        scroll.addView(content)
        root.addView(scroll, LinearLayout.LayoutParams(-1, 0, 1f))
        label(content, title, 30, true)
        if (signedIn) {
            val buttons = LinearLayout(this)
            val tabs = if (BuildConfig.ADMIN_APP) listOf("Home", "Communities", "Approvals", "History", "Account")
                else listOf("Home", "Groups", "History", "Account")
            for (name in tabs) {
                val button = Button(this).apply {
                    text = name
                    textSize = 10f
                    isAllCaps = false
                    setPadding(0, 0, 0, 0)
                    setTextColor(if (tab == name) accent else muted)
                    contentDescription = "$name tab"
                    setOnClickListener { navigate(name) }
                }
                buttons.addView(button, LinearLayout.LayoutParams(0, dp(54), 1f))
            }
            root.addView(buttons)
        }
        setContentView(root)
    }

    private fun navigate(destination: String) {
        if (store.session() == null) { loginScreen(); return }
        tab = destination
        when (destination) {
            "Groups" -> groups()
            "History" -> history()
            "Account" -> account()
            "Communities" -> communities()
            "Approvals" -> approvals()
            else -> home()
        }
    }

    private fun loginScreen(message: String? = null) {
        tab = "Home"
        screen(if (BuildConfig.ADMIN_APP) "Welcome, admin" else "Save together.\nGrow together.", false)
        label(content, "Sign in with your existing phone number or email and password.", 16)
        if (message != null) note(message)
        val identifier = field(content, "Phone number or email", InputType.TYPE_CLASS_TEXT)
        val password = field(content, "Password", InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD)
        password.isSaveEnabled = false
        val button = action(content, "Sign in") {}
        button.setOnClickListener {
            val name = identifier.text.toString().trim()
            val secret = password.text.toString()
            if (name.isEmpty() || secret.isEmpty()) { toast("Enter your phone/email and password."); return@setOnClickListener }
            if (!online()) { toast("Sign-in requires internet."); return@setOnClickListener }
            button.isEnabled = false
            button.text = "Signing in…"
            task({ repository.login(name, secret) }, {
                password.text.clear()
                navigate("Home")
            }, {
                button.isEnabled = true
                button.text = "Sign in"
                note(errorMessage(it))
            })
        }
        label(content, "Passwords and approval PINs are never saved. Each app keeps its own encrypted session.", 13)
        action(content, if (BuildConfig.ADMIN_APP) "Admin account setup on website" else "Create an account on website", false) {
            openWebsite(if (BuildConfig.ADMIN_APP) "https://kibbi-admin.vercel.app/" else "https://kibbisave.com/login")
        }
        label(content, "This native version uses password sign-in. Google sign-in and account onboarding remain on the website for now.", 13)
    }

    private fun home() {
        screen("Hello, ${store.session()?.name?.substringBefore(' ') ?: "member"}")
        val path = if (BuildConfig.ADMIN_APP) "/api/admin/home" else "/api/home"
        load(path) { saved ->
            val data = saved.data
            if (BuildConfig.ADMIN_APP) {
                metric("Approved collections", ugx(data.optDouble("totalCollected")))
                metric("Awaiting approval", data.optInt("pendingCount").toString())
                metric("Community members", data.optInt("memberCount").toString())
                action(content, "Review pending deposits") { navigate("Approvals") }
                label(content, "Approvals always require a live server check and your PIN.", 14)
            } else {
                val summary = data.optJSONObject("summary") ?: JSONObject()
                metric("Total savings", ugx(summary.optDouble("total_savings")))
                metric("Savings goal", ugx(summary.optDouble("total_goal")))
                metric("Active groups", summary.optInt("active_groups").toString())
                action(content, "My savings groups") { navigate("Groups") }
                label(content, "Your savings groups", 20, true)
                groupCards(data.optJSONArray("my_groups") ?: JSONArray(), saved.offline)
            }
        }
    }

    private fun groups() {
        screen("My groups")
        load("/api/groups/mine") { saved ->
            groupCards(saved.data.optJSONArray("groups") ?: JSONArray(), saved.offline)
            action(content, "Explore open groups", false) { exploreGroups() }
            action(content, "Create a savings group", false) { createGroup() }
        }
    }

    private fun groupCards(groups: JSONArray, offline: Boolean) {
        if (groups.length() == 0) { note("No savings groups to show."); return }
        for (i in 0 until groups.length()) {
            val group = groups.getJSONObject(i)
            val id = group.optString("group_id").ifBlank { group.optString("id") }
            val name = group.optString("group_name").ifBlank { group.optString("name", "Savings group") }
            val card = card()
            label(card, name, 19, true)
            val deposited = if (group.has("total_deposited")) group.optDouble("total_deposited") else group.optDouble("total_saved")
            label(card, "${if (group.has("total_deposited")) "Your savings" else "Group savings"}: ${ugx(deposited)}", 16)
            if (group.has("goal_amount")) label(card, "Goal ${ugx(group.optDouble("goal_amount"))}", 14)
            if (group.has("code")) label(card, "Code: ${group.optString("code")}", 13)
            if (id.isNotBlank()) {
                action(card, if (offline) "Connect to request a deposit" else "Request a deposit") {
                    if (!online() || offline) toast("Refresh this page online before requesting a deposit.") else deposit(id, name)
                }.isEnabled = !offline && online()
            }
        }
    }

    private fun history() {
        screen(if (BuildConfig.ADMIN_APP) "Approved transactions" else "Savings history")
        val path = if (BuildConfig.ADMIN_APP) "/api/admin/transactions" else "/api/profile/history"
        load(path) { saved ->
            if (!BuildConfig.ADMIN_APP) note("This history shows posted deposits. Requests awaiting admin approval are not confirmed savings.")
            val rows = saved.data.optJSONArray(if (BuildConfig.ADMIN_APP) "transactions" else "history") ?: JSONArray()
            if (rows.length() == 0) note("No transactions to show.")
            for (i in 0 until rows.length()) {
                val item = rows.getJSONObject(i)
                val card = card()
                label(card, item.optString("title").ifBlank { item.optString("display_name", "Deposit") }, 17, true)
                label(card, if (BuildConfig.ADMIN_APP) ugx(item.optDouble("amount")) else item.optString("amount"), 22, true)
                label(card, item.optString("status", ""), 14)
                label(card, item.optString("date").ifBlank { item.optString("created_at", "") }, 12)
            }
        }
    }

    private fun account() {
        screen("My account")
        label(content, store.session()?.name ?: "Member", 24, true)
        label(content, "${if (BuildConfig.ADMIN_APP) "Admin" else "User"} app · Kotlin native", 14)
        label(content, if (BuildConfig.ADMIN_APP) "Admin data and permissions are checked online. No approval data is saved offline."
            else "After you sync, balances, groups, and savings history can be read offline for up to 24 hours while your session is valid.", 15)
        action(content, "Clear saved offline data", false) {
            task({ store.clearSnapshots() }, { toast("Saved data cleared.") })
        }
        if (store.pendingWrite() != null) unresolvedWrite()
        action(content, "Sign out") {
            AlertDialog.Builder(this).setTitle("Sign out?").setMessage("This removes the session and all saved data from this app.")
                .setNegativeButton("Cancel", null).setPositiveButton("Sign out") { _, _ ->
                    task({ try { repository.logout() } catch (_: Exception) { store.clear() } }, { loginScreen("Signed out. Local data removed.") })
                }.show()
        }
    }

    private fun communities() {
        screen("My communities")
        load("/api/admin/communities") { saved ->
            val rows = saved.data.optJSONArray("communities") ?: JSONArray()
            if (rows.length() == 0) note("No managed communities to show.")
            for (i in 0 until rows.length()) {
                val item = rows.getJSONObject(i)
                val card = card()
                label(card, item.optString("name", "Community"), 20, true)
                label(card, "${item.optInt("total_members")} members · ${ugx(item.optDouble("total_saved"))} saved", 15)
                label(card, item.optString("about"), 14)
            }
        }
    }

    private fun approvals() {
        screen("Pending approvals")
        if (store.pendingWrite() != null) unresolvedWrite()
        load("/api/admin/approvals") { saved ->
            val requests = saved.data.optJSONArray("requests") ?: JSONArray()
            if (requests.length() == 0) note("No deposits awaiting approval.")
            for (i in 0 until requests.length()) {
                val item = requests.getJSONObject(i)
                val card = card()
                label(card, item.optString("display_name", "Member"), 20, true)
                label(card, ugx(item.optDouble("amount")), 26, true)
                label(card, "${item.optString("payment_method")} · ${item.optString("community_name")}", 14)
                label(card, item.optString("created_at"), 12)
                action(card, "Verify receipt and approve") { approve(item) }.isEnabled = online() && store.pendingWrite() == null
            }
        }
    }

    private fun approve(item: JSONObject) {
        if (!online()) { toast("Approval requires internet."); return }
        val form = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(dp(20), 0, dp(20), 0) }
        label(form, "Verify you received ${ugx(item.optDouble("amount"))} from ${item.optString("display_name")}.", 16)
        val acknowledged = CheckBox(this).apply { text = "I have independently verified receipt of this payment" }
        form.addView(acknowledged)
        val pin = field(form, "4-digit approval PIN", InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_VARIATION_PASSWORD)
        pin.isSaveEnabled = false
        val dialog = AlertDialog.Builder(this).setTitle("Approve deposit").setView(form)
            .setNegativeButton("Cancel", null).setPositiveButton("Approve", null).create()
        dialog.setOnShowListener {
            dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener {
                val secret = pin.text.toString()
                if (!acknowledged.isChecked || !secret.matches(Regex("[0-9]{4}"))) { toast("Verify receipt and enter your 4-digit PIN."); return@setOnClickListener }
                pin.text.clear()
                dialog.dismiss()
                write("/api/admin/approvals/${item.getString("id")}/approve", JSONObject().put("pin", secret).put("acknowledged", true),
                    "Deposit approved by the server.", "Approvals")
            }
        }
        dialog.show()
    }

    private fun deposit(groupId: String, name: String) {
        screen("Request a deposit")
        label(content, name, 20, true)
        note("This sends a deposit request to your community admin. It does not transfer mobile money or confirm a payment.")
        if (store.pendingWrite() != null) { unresolvedWrite(); return }
        val amount = field(content, "Amount (whole UGX)", InputType.TYPE_CLASS_NUMBER)
        val phone = field(content, "Mobile money phone (optional)", InputType.TYPE_CLASS_PHONE)
        val provider = Spinner(this).apply {
            adapter = ArrayAdapter(this@MainActivity, android.R.layout.simple_spinner_dropdown_item,
                listOf("MTN Mobile Money", "Airtel Money", "Cash"))
        }
        label(content, "Payment method", 14, true)
        content.addView(provider)
        action(content, "Review request") {
            val value = Money.positiveUgx(amount.text.toString())
            if (value == null) { toast("Enter a positive whole UGX amount."); return@action }
            val method = listOf("mtn_momo", "airtel", "cash")[provider.selectedItemPosition]
            val body = JSONObject().put("group_id", groupId).put("amount", value).put("provider", method)
                .put("phone", phone.text.toString().trim())
            AlertDialog.Builder(this).setTitle("Send request?")
                .setMessage("Request ${ugx(value.toDouble())} for $name? Your admin must confirm receipt before it counts as savings.")
                .setNegativeButton("Cancel", null).setPositiveButton("Send request") { _, _ ->
                    write("/api/deposits", body, "Deposit request submitted. It is not a confirmed payment.", "History")
                }.show()
        }.isEnabled = online()
    }

    private fun exploreGroups() {
        screen("Open savings groups")
        load("/api/home") { saved ->
            if (saved.offline) { note("Connect to the internet to explore and join groups."); return@load }
            val rows = saved.data.optJSONArray("open_groups") ?: JSONArray()
            if (rows.length() == 0) note("No open groups available.")
            for (i in 0 until rows.length()) {
                val group = rows.getJSONObject(i)
                val id = group.optString("id").ifBlank { group.optString("group_id") }
                val name = group.optString("name").ifBlank { group.optString("group_name", "Savings group") }
                val card = card()
                label(card, name, 20, true)
                label(card, "${group.optInt("current_members")} members", 14)
                if (id.isNotBlank()) action(card, "Join group") { joinGroup(id, name) }
            }
        }
    }

    private fun joinGroup(id: String, name: String) {
        screen("Join $name")
        val goal = field(content, "Your savings goal (UGX)", InputType.TYPE_CLASS_NUMBER)
        val purpose = field(content, "What are you saving for?")
        val code = field(content, "Joining code (if required)")
        action(content, "Join group") {
            val value = Money.positiveUgx(goal.text.toString())
            if (value == null) { toast("Enter a positive whole UGX goal."); return@action }
            write("/api/groups/$id/join", JSONObject().put("goal_amount", value)
                .put("saving_for", purpose.text.toString()).put("code", code.text.toString()), "You joined the group.", "Groups")
        }.isEnabled = online()
    }

    private fun createGroup() {
        screen("Create a group")
        val name = field(content, "Group name (up to 10 characters)")
        label(content, "Savings period", 14, true)
        val duration = Spinner(this).apply {
            adapter = ArrayAdapter(this@MainActivity, android.R.layout.simple_spinner_dropdown_item, listOf("3 months", "5 months", "8 months", "12 months"))
        }
        content.addView(duration)
        val open = CheckBox(this).apply { text = "Anyone can join"; isChecked = true }
        content.addView(open)
        action(content, "Create group") {
            val title = name.text.toString().trim()
            if (title.isEmpty() || title.length > 10) { toast("Use a name with 1–10 characters."); return@action }
            write("/api/groups", JSONObject().put("name", title)
                .put("period_months", listOf(3, 5, 8, 12)[duration.selectedItemPosition]).put("anyone_can_join", open.isChecked),
                "Group created. You can find its code under My groups.", "Groups")
        }.isEnabled = online()
    }

    private fun write(path: String, body: JSONObject, success: String, returnTab: String) {
        if (!online()) { toast("This action requires internet. Nothing has been queued."); return }
        screen("Sending request…")
        note("Please wait for the server. Do not submit this action elsewhere while it is in progress.")
        task({ repository.post(path, body) }, { result ->
            navigate(returnTab)
            val receipt = if (path == "/api/deposits" && result.optBoolean("pending")) {
                "Request submitted and awaiting admin approval. No mobile-money transfer has been made by this app.\n\nRequest: " +
                    result.optJSONObject("request")?.optString("id", "See your admin")
            } else success
            AlertDialog.Builder(this).setTitle("Server confirmed").setMessage(receipt).setPositiveButton("OK", null).show()
        }, { error ->
            screen("Request could not be confirmed")
            note(errorMessage(error))
            if (store.pendingWrite() != null) unresolvedWrite()
            action(content, "Return to $returnTab") { navigate(returnTab) }
        })
    }

    private fun unresolvedWrite() {
        note("A previous payment action has not been confirmed on this device. Do not resend it until you check live history or approvals with your admin.")
        action(content, "I have checked the server result", false) {
            AlertDialog.Builder(this).setTitle("Enable another payment action?")
                .setMessage("Only continue after checking the live result. Clearing this reminder does not cancel or repeat the earlier request.")
                .setNegativeButton("Keep reminder", null).setPositiveButton("I checked") { _, _ ->
                    if (!online()) toast("Reconnect and check the server first.")
                    else task({ store.resolveWrite() }, { navigate(tab) })
                }.show()
        }
    }

    private fun load(path: String, render: (Snapshot) -> Unit) {
        val status = label(content, "Loading…", 14)
        task({ repository.load(path) }, { saved ->
            content.removeView(status)
            lastSnapshotOffline = saved.offline
            refreshConnection()
            note(if (saved.offline) "Saved data · ${formatTime(saved.savedAt)}\nThese numbers may have changed. Reconnect and refresh before taking action."
                else "Last synced ${formatTime(saved.savedAt)}")
            action(content, "Refresh", false) { navigate(tab) }
            render(saved)
        }, { error ->
            content.removeView(status)
            if (error is ApiException && error.status == 401) { loginScreen(error.message); return@task }
            note(errorMessage(error))
            action(content, "Try again", false) { navigate(tab) }
        })
    }

    private fun <T> task(work: () -> T, success: (T) -> Unit, failure: (Exception) -> Unit = { note(errorMessage(it)) }) {
        val ticket = generation
        app.executor.execute {
            val result: Result<T> = try { Result.success(work()) } catch (error: Exception) { Result.failure(error) }
            main.post {
                if (!isDestroyed && !isFinishing && generation == ticket) {
                    result.fold(success, { failure(it as? Exception ?: Exception(it)) })
                }
            }
        }
    }

    private fun errorMessage(error: Exception): String = when (error) {
        is IOException -> "Could not connect. No usable saved data is available for this screen. Reconnect and refresh. Payment requests are never queued."
        else -> error.message?.take(240) ?: "Something went wrong. Please try again."
    }

    private fun openWebsite(url: String) {
        try { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) }
        catch (_: android.content.ActivityNotFoundException) { toast("Open $url in a browser to manage your account.") }
    }

    private fun label(parent: LinearLayout, value: String, size: Int = 16, bold: Boolean = false): TextView = TextView(this).apply {
        text = value
        textSize = size.toFloat()
        setTextColor(if (size <= 14) muted else navy)
        if (bold) setTypeface(typeface, Typeface.BOLD)
        setPadding(0, dp(7), 0, dp(7))
        parent.addView(this)
    }

    private fun field(parent: LinearLayout, title: String, type: Int = InputType.TYPE_CLASS_TEXT): EditText {
        val caption = label(parent, title, 14, true)
        return EditText(this).apply {
            id = View.generateViewId()
            caption.labelFor = id
            hint = title
            inputType = type
            isSingleLine = true
            isSaveEnabled = false
            setTextColor(navy)
            parent.addView(this, LinearLayout.LayoutParams(-1, dp(56)))
        }
    }

    private fun action(parent: LinearLayout, title: String, primary: Boolean = true, click: () -> Unit): Button = Button(this).apply {
        text = title
        isAllCaps = false
        setTextColor(if (primary) Color.WHITE else accent)
        background = GradientDrawable().apply {
            setColor(if (primary) accent else Color.TRANSPARENT)
            cornerRadius = dp(12).toFloat()
            if (!primary) setStroke(dp(1), Color.rgb(205, 213, 228))
        }
        setPadding(dp(12), dp(8), dp(12), dp(8))
        minimumHeight = dp(52)
        parent.addView(this, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(12); bottomMargin = dp(4) })
        setOnClickListener { click() }
    }

    private fun card(): LinearLayout = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        setPadding(dp(18), dp(14), dp(18), dp(14))
        background = GradientDrawable().apply { setColor(Color.WHITE); cornerRadius = dp(18).toFloat() }
        content.addView(this, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(14) })
    }

    private fun metric(title: String, value: String) {
        val card = card()
        label(card, title, 14)
        label(card, value, 30, true)
    }

    private fun note(value: String) { label(content, value, 14) }
    private fun toast(value: String) { Toast.makeText(this, value, Toast.LENGTH_LONG).show() }
    private fun dp(value: Int) = (value * resources.displayMetrics.density).toInt()
    private fun ugx(value: Double) = if (value.isFinite()) "UGX " + NumberFormat.getIntegerInstance(Locale.UK).format(value) else "Not available"
    private fun formatTime(value: Long) = DateFormat.getDateTimeInstance(DateFormat.SHORT, DateFormat.SHORT).format(Date(value))
}
