package com.repguide.app

import android.content.Intent
import android.os.Bundle
import android.view.View
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.repguide.app.api.ApiClient
import com.repguide.app.databinding.ActivityLoginBinding
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class LoginActivity : AppCompatActivity() {

    private lateinit var binding: ActivityLoginBinding

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (Prefs.token(this) != null) {
            openMain()
            return
        }
        binding = ActivityLoginBinding.inflate(layoutInflater)
        setContentView(binding.root)

        binding.loginButton.setOnClickListener { doLogin() }
        binding.passwordInput.setOnEditorActionListener { _, _, _ ->
            doLogin()
            true
        }
    }

    private fun doLogin() {
        val username = binding.usernameInput.text?.toString()?.trim().orEmpty()
        val password = binding.passwordInput.text?.toString().orEmpty()
        if (username.isEmpty() || password.isEmpty()) {
            showError(getString(R.string.error_empty_fields))
            return
        }
        setLoading(true)
        lifecycleScope.launch {
            try {
                val result = withContext(Dispatchers.IO) {
                    ApiClient.login(
                        Prefs.serverUrl(this@LoginActivity),
                        username,
                        password,
                        getString(R.string.error_unknown)
                    )
                }
                Prefs.saveSession(this@LoginActivity, result.token, result.userName)
                openMain()
            } catch (e: ApiClient.ApiException) {
                setLoading(false)
                showError(e.message ?: getString(R.string.error_unknown))
            } catch (e: ApiClient.NetworkException) {
                setLoading(false)
                showError(getString(R.string.error_network))
            } catch (e: Exception) {
                setLoading(false)
                showError(getString(R.string.error_unknown))
            }
        }
    }

    private fun setLoading(loading: Boolean) {
        binding.loginProgress.visibility = if (loading) View.VISIBLE else View.GONE
        binding.loginButton.isEnabled = !loading
        if (loading) binding.errorText.visibility = View.GONE
    }

    private fun showError(message: String) {
        binding.errorText.text = message
        binding.errorText.visibility = View.VISIBLE
    }

    private fun openMain() {
        startActivity(Intent(this, MainActivity::class.java))
        finish()
    }
}
