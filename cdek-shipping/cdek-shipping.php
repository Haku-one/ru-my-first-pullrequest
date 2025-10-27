<?php
/**
 * Plugin Name: CDEK Shipping for WooCommerce
 * Plugin URI: https://example.com
 * Description: Интеграция с СДЭК для WooCommerce с упрощенной формой адреса
 * Version: 1.0.0
 * Author: Your Name
 * License: GPL v2 or later
 * Requires at least: 5.0
 * Tested up to: 6.4
 * WC requires at least: 5.0
 * WC tested up to: 8.5
 * Text Domain: cdek-shipping
 * Domain Path: /languages
 */

// Prevent direct access
if (!defined('ABSPATH')) {
    exit;
}

// Check if WooCommerce is active
if (!in_array('woocommerce/woocommerce.php', apply_filters('active_plugins', get_option('active_plugins')))) {
    return;
}

define('CDEK_SHIPPING_VERSION', '1.0.0');
define('CDEK_SHIPPING_PLUGIN_DIR', plugin_dir_path(__FILE__));
define('CDEK_SHIPPING_PLUGIN_URL', plugin_dir_url(__FILE__));

class CDEK_Shipping_Plugin {
    
    public function __construct() {
        add_action('init', array($this, 'init'));
        add_action('woocommerce_shipping_init', array($this, 'shipping_init'));
        add_filter('woocommerce_shipping_methods', array($this, 'add_shipping_method'));
        
        // Remove unnecessary fields from checkout
        add_filter('woocommerce_checkout_fields', array($this, 'customize_checkout_fields'));
        add_filter('woocommerce_default_address_fields', array($this, 'customize_address_fields'));
        
        // Enqueue scripts and styles
        add_action('wp_enqueue_scripts', array($this, 'enqueue_scripts'));
        
        // Add admin menu
        add_action('admin_menu', array($this, 'add_admin_menu'));
        
        // Add settings link
        add_filter('plugin_action_links_' . plugin_basename(__FILE__), array($this, 'add_settings_link'));
    }
    
    public function init() {
        load_plugin_textdomain('cdek-shipping', false, dirname(plugin_basename(__FILE__)) . '/languages');
    }
    
    public function shipping_init() {
        if (!class_exists('WC_CDEK_Shipping_Method')) {
            include_once CDEK_SHIPPING_PLUGIN_DIR . 'includes/class-wc-cdek-shipping-method.php';
        }
    }
    
    public function add_shipping_method($methods) {
        $methods['cdek_shipping'] = 'WC_CDEK_Shipping_Method';
        return $methods;
    }
    
    public function customize_checkout_fields($fields) {
        // Remove unnecessary fields for shipping
        if (isset($fields['shipping'])) {
            unset($fields['shipping']['shipping_city']);
            unset($fields['shipping']['shipping_state']);
            unset($fields['shipping']['shipping_postcode']);
        }
        
        return $fields;
    }
    
    public function customize_address_fields($fields) {
        // Remove city, state, postcode from default address fields
        if (isset($fields['city'])) {
            $fields['city']['required'] = false;
            $fields['city']['class'] = array('form-row-hidden');
        }
        if (isset($fields['state'])) {
            $fields['state']['required'] = false;
            $fields['state']['class'] = array('form-row-hidden');
        }
        if (isset($fields['postcode'])) {
            $fields['postcode']['required'] = false;
            $fields['postcode']['class'] = array('form-row-hidden');
        }
        
        return $fields;
    }
    
    public function enqueue_scripts() {
        if (is_checkout() || is_cart()) {
            wp_enqueue_script('cdek-shipping-js', CDEK_SHIPPING_PLUGIN_URL . 'assets/js/cdek-shipping.js', array('jquery'), CDEK_SHIPPING_VERSION, true);
            wp_enqueue_style('cdek-shipping-css', CDEK_SHIPPING_PLUGIN_URL . 'assets/css/cdek-shipping.css', array(), CDEK_SHIPPING_VERSION);
            
            wp_localize_script('cdek-shipping-js', 'cdek_ajax', array(
                'ajax_url' => admin_url('admin-ajax.php'),
                'nonce' => wp_create_nonce('cdek_nonce'),
                'yandex_api_key' => get_option('cdek_yandex_api_key', '4020b4d5-1d96-476c-a10e-8ab18f0f3702')
            ));
        }
    }
    
    public function add_admin_menu() {
        add_options_page(
            'CDEK Shipping Settings',
            'CDEK Shipping',
            'manage_options',
            'cdek-shipping-settings',
            array($this, 'admin_page')
        );
    }
    
    public function add_settings_link($links) {
        $settings_link = '<a href="' . admin_url('options-general.php?page=cdek-shipping-settings') . '">Settings</a>';
        array_unshift($links, $settings_link);
        return $links;
    }
    
    public function admin_page() {
        include_once CDEK_SHIPPING_PLUGIN_DIR . 'includes/admin-page.php';
    }
}

// Initialize the plugin
new CDEK_Shipping_Plugin();

// Include order handler
if (is_admin()) {
    include_once CDEK_SHIPPING_PLUGIN_DIR . 'includes/class-cdek-order-handler.php';
}

// AJAX handlers
add_action('wp_ajax_cdek_get_pickup_points', 'cdek_get_pickup_points');
add_action('wp_ajax_nopriv_cdek_get_pickup_points', 'cdek_get_pickup_points');

function cdek_get_pickup_points() {
    check_ajax_referer('cdek_nonce', 'nonce');
    
    $city = sanitize_text_field($_POST['city']);
    
    if (empty($city)) {
        wp_send_json_error('City is required');
    }
    
    include_once CDEK_SHIPPING_PLUGIN_DIR . 'includes/class-cdek-api.php';
    $cdek_api = new CDEK_API();
    
    $pickup_points = $cdek_api->get_pickup_points($city);
    
    if ($pickup_points) {
        wp_send_json_success($pickup_points);
    } else {
        wp_send_json_error('No pickup points found');
    }
}