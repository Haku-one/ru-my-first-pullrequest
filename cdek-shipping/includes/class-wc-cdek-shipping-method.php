<?php

if (!defined('ABSPATH')) {
    exit;
}

class WC_CDEK_Shipping_Method extends WC_Shipping_Method {
    
    public function __construct($instance_id = 0) {
        $this->id = 'cdek_shipping';
        $this->instance_id = absint($instance_id);
        $this->method_title = __('CDEK Shipping', 'cdek-shipping');
        $this->method_description = __('CDEK delivery service integration', 'cdek-shipping');
        
        $this->supports = array(
            'shipping-zones',
            'instance-settings',
            'instance-settings-modal',
        );
        
        $this->init();
    }
    
    public function init() {
        $this->init_form_fields();
        $this->init_settings();
        
        $this->title = $this->get_option('title');
        $this->enabled = $this->get_option('enabled');
        
        add_action('woocommerce_update_options_shipping_' . $this->id, array($this, 'process_admin_options'));
    }
    
    public function init_form_fields() {
        $this->instance_form_fields = array(
            'enabled' => array(
                'title' => __('Enable/Disable', 'cdek-shipping'),
                'type' => 'checkbox',
                'label' => __('Enable CDEK Shipping', 'cdek-shipping'),
                'default' => 'yes'
            ),
            'title' => array(
                'title' => __('Method Title', 'cdek-shipping'),
                'type' => 'text',
                'description' => __('This controls the title which the user sees during checkout.', 'cdek-shipping'),
                'default' => __('CDEK Delivery', 'cdek-shipping'),
                'desc_tip' => true,
            ),
            'from_city' => array(
                'title' => __('From City', 'cdek-shipping'),
                'type' => 'text',
                'description' => __('City from which orders will be shipped', 'cdek-shipping'),
                'default' => 'Москва',
                'desc_tip' => true,
            ),
            'pickup_delivery' => array(
                'title' => __('Pickup Points', 'cdek-shipping'),
                'type' => 'checkbox',
                'label' => __('Enable pickup points delivery', 'cdek-shipping'),
                'default' => 'yes'
            ),
            'courier_delivery' => array(
                'title' => __('Courier Delivery', 'cdek-shipping'),
                'type' => 'checkbox',
                'label' => __('Enable courier delivery', 'cdek-shipping'),
                'default' => 'yes'
            ),
            'markup' => array(
                'title' => __('Markup (%)', 'cdek-shipping'),
                'type' => 'number',
                'description' => __('Additional markup percentage for delivery cost', 'cdek-shipping'),
                'default' => '0',
                'desc_tip' => true,
                'custom_attributes' => array(
                    'min' => '0',
                    'step' => '0.01'
                )
            ),
            'free_shipping_amount' => array(
                'title' => __('Free Shipping Amount', 'cdek-shipping'),
                'type' => 'number',
                'description' => __('Minimum order amount for free shipping (0 to disable)', 'cdek-shipping'),
                'default' => '0',
                'desc_tip' => true,
                'custom_attributes' => array(
                    'min' => '0',
                    'step' => '0.01'
                )
            ),
        );
    }
    
    public function calculate_shipping($package = array()) {
        if (!$this->is_available($package)) {
            return;
        }
        
        $shipping_address = $package['destination'];
        $city = $this->extract_city_from_address($shipping_address['address_1']);
        
        if (empty($city)) {
            return;
        }
        
        // Get packages data from cart
        $packages_data = $this->prepare_packages($package['contents']);
        
        if (empty($packages_data)) {
            return;
        }
        
        include_once CDEK_SHIPPING_PLUGIN_DIR . 'includes/class-cdek-api.php';
        $cdek_api = new CDEK_API();
        
        $from_city = $this->get_option('from_city', 'Москва');
        $delivery_options = $cdek_api->calculate_delivery($from_city, $city, $packages_data);
        
        if (!$delivery_options || !isset($delivery_options['tariff_codes'])) {
            return;
        }
        
        $cart_total = WC()->cart->get_cart_contents_total();
        $free_shipping_amount = floatval($this->get_option('free_shipping_amount', 0));
        $markup = floatval($this->get_option('markup', 0));
        
        foreach ($delivery_options['tariff_codes'] as $tariff) {
            $cost = floatval($tariff['delivery_sum']);
            
            // Apply markup
            if ($markup > 0) {
                $cost = $cost * (1 + $markup / 100);
            }
            
            // Apply free shipping
            if ($free_shipping_amount > 0 && $cart_total >= $free_shipping_amount) {
                $cost = 0;
            }
            
            $rate_id = $this->id . '_' . $tariff['tariff_code'];
            $rate_label = $this->title . ' (' . $tariff['tariff_name'] . ')';
            
            if (isset($tariff['period_min']) && isset($tariff['period_max'])) {
                $rate_label .= ' - ' . $tariff['period_min'] . '-' . $tariff['period_max'] . ' дней';
            }
            
            $rate = array(
                'id' => $rate_id,
                'label' => $rate_label,
                'cost' => $cost,
                'meta_data' => array(
                    'tariff_code' => $tariff['tariff_code'],
                    'tariff_name' => $tariff['tariff_name'],
                    'delivery_sum' => $tariff['delivery_sum'],
                    'period_min' => $tariff['period_min'] ?? '',
                    'period_max' => $tariff['period_max'] ?? '',
                    'city' => $city
                )
            );
            
            $this->add_rate($rate);
        }
    }
    
    /**
     * Extract city from address string
     */
    private function extract_city_from_address($address) {
        // Simple city extraction - you might want to improve this
        $address_parts = explode(',', $address);
        
        foreach ($address_parts as $part) {
            $part = trim($part);
            // Look for city patterns
            if (preg_match('/^[а-яё\s\-]+$/ui', $part) && strlen($part) > 2) {
                // Remove common prefixes
                $part = preg_replace('/^(г\.|город|пос\.|поселок|с\.|село)\s*/ui', '', $part);
                return trim($part);
            }
        }
        
        return '';
    }
    
    /**
     * Prepare packages data for CDEK API
     */
    private function prepare_packages($cart_contents) {
        $total_weight = 0;
        $dimensions = array('length' => 0, 'width' => 0, 'height' => 0);
        
        foreach ($cart_contents as $item) {
            $product = $item['data'];
            $quantity = $item['quantity'];
            
            // Weight in grams
            $weight = floatval($product->get_weight());
            if ($weight > 0) {
                $total_weight += $weight * $quantity;
            }
            
            // Dimensions in cm
            $length = floatval($product->get_length());
            $width = floatval($product->get_width());
            $height = floatval($product->get_height());
            
            if ($length > 0) $dimensions['length'] = max($dimensions['length'], $length);
            if ($width > 0) $dimensions['width'] = max($dimensions['width'], $width);
            if ($height > 0) $dimensions['height'] = max($dimensions['height'], $height);
        }
        
        // Default values if not set
        if ($total_weight <= 0) {
            $total_weight = 500; // 500g default
        }
        
        if ($dimensions['length'] <= 0) $dimensions['length'] = 10;
        if ($dimensions['width'] <= 0) $dimensions['width'] = 10;
        if ($dimensions['height'] <= 0) $dimensions['height'] = 10;
        
        return array(
            array(
                'weight' => intval($total_weight),
                'length' => intval($dimensions['length']),
                'width' => intval($dimensions['width']),
                'height' => intval($dimensions['height'])
            )
        );
    }
    
    public function is_available($package) {
        if ($this->enabled !== 'yes') {
            return false;
        }
        
        // Check if destination is Russia
        if (isset($package['destination']['country']) && $package['destination']['country'] !== 'RU') {
            return false;
        }
        
        return parent::is_available($package);
    }
}