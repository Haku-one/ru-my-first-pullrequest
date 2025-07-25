<?php

if (!defined('ABSPATH')) {
    exit;
}

class CDEK_Order_Handler {
    
    public function __construct() {
        add_action('woocommerce_checkout_order_processed', array($this, 'process_cdek_order'), 10, 3);
        add_action('woocommerce_order_status_changed', array($this, 'handle_order_status_change'), 10, 4);
        add_action('add_meta_boxes', array($this, 'add_cdek_meta_box'));
        add_action('wp_ajax_create_cdek_order', array($this, 'ajax_create_cdek_order'));
        add_action('wp_ajax_get_cdek_order_status', array($this, 'ajax_get_cdek_order_status'));
    }
    
    /**
     * Process CDEK order after WooCommerce order is created
     */
    public function process_cdek_order($order_id, $posted_data, $order) {
        $shipping_methods = $order->get_shipping_methods();
        
        foreach ($shipping_methods as $shipping_method) {
            if (strpos($shipping_method->get_method_id(), 'cdek_shipping') !== false) {
                $this->save_cdek_order_data($order, $shipping_method, $posted_data);
                break;
            }
        }
    }
    
    /**
     * Save CDEK specific data to order meta
     */
    private function save_cdek_order_data($order, $shipping_method, $posted_data) {
        $order_id = $order->get_id();
        
        // Save pickup point if selected
        if (isset($_POST['cdek_pickup_point']) && !empty($_POST['cdek_pickup_point'])) {
            update_post_meta($order_id, '_cdek_pickup_point', sanitize_text_field($_POST['cdek_pickup_point']));
        }
        
        // Save shipping method meta data
        $meta_data = $shipping_method->get_meta_data();
        foreach ($meta_data as $meta) {
            if (isset($meta['tariff_code'])) {
                update_post_meta($order_id, '_cdek_tariff_code', $meta['tariff_code']);
            }
            if (isset($meta['tariff_name'])) {
                update_post_meta($order_id, '_cdek_tariff_name', $meta['tariff_name']);
            }
            if (isset($meta['city'])) {
                update_post_meta($order_id, '_cdek_city', $meta['city']);
            }
        }
        
        // Mark as CDEK order
        update_post_meta($order_id, '_is_cdek_order', 'yes');
    }
    
    /**
     * Handle order status changes
     */
    public function handle_order_status_change($order_id, $old_status, $new_status, $order) {
        if (!get_post_meta($order_id, '_is_cdek_order', true)) {
            return;
        }
        
        // Auto-create CDEK order when WC order is processing
        if ($new_status === 'processing' && !get_post_meta($order_id, '_cdek_order_uuid', true)) {
            $this->create_cdek_order($order_id);
        }
    }
    
    /**
     * Create CDEK order
     */
    public function create_cdek_order($order_id) {
        $order = wc_get_order($order_id);
        
        if (!$order) {
            return false;
        }
        
        include_once CDEK_SHIPPING_PLUGIN_DIR . 'includes/class-cdek-api.php';
        $cdek_api = new CDEK_API();
        
        $order_data = $this->prepare_cdek_order_data($order);
        
        if (!$order_data) {
            return false;
        }
        
        $response = $cdek_api->create_order($order_data);
        
        if ($response && isset($response['entity']['uuid'])) {
            update_post_meta($order_id, '_cdek_order_uuid', $response['entity']['uuid']);
            update_post_meta($order_id, '_cdek_order_number', $response['entity']['cdek_number'] ?? '');
            
            $order->add_order_note('CDEK заказ создан. UUID: ' . $response['entity']['uuid']);
            
            return $response['entity']['uuid'];
        } else {
            $error_message = 'Ошибка создания CDEK заказа';
            if (isset($response['errors'])) {
                $error_message .= ': ' . json_encode($response['errors']);
            }
            $order->add_order_note($error_message);
            
            return false;
        }
    }
    
    /**
     * Prepare order data for CDEK API
     */
    private function prepare_cdek_order_data($order) {
        $order_id = $order->get_id();
        
        $tariff_code = get_post_meta($order_id, '_cdek_tariff_code', true);
        $pickup_point = get_post_meta($order_id, '_cdek_pickup_point', true);
        
        if (!$tariff_code) {
            return false;
        }
        
        // Sender info (from plugin settings or defaults)
        $from_city = get_option('cdek_from_city', 'Москва');
        $sender_data = array(
            'name' => get_option('cdek_sender_name', get_bloginfo('name')),
            'phones' => array(
                array('number' => get_option('cdek_sender_phone', '+7-000-000-00-00'))
            )
        );
        
        // Recipient info
        $recipient_data = array(
            'name' => $order->get_shipping_first_name() . ' ' . $order->get_shipping_last_name(),
            'phones' => array(
                array('number' => $order->get_shipping_phone())
            )
        );
        
        // Delivery location
        $to_location = array();
        
        if ($pickup_point) {
            $to_location['code'] = $pickup_point;
        } else {
            $city = get_post_meta($order_id, '_cdek_city', true);
            if ($city) {
                include_once CDEK_SHIPPING_PLUGIN_DIR . 'includes/class-cdek-api.php';
                $cdek_api = new CDEK_API();
                $city_data = $cdek_api->get_city_by_name($city);
                
                if ($city_data) {
                    $to_location['code'] = $city_data['code'];
                    $to_location['address'] = $order->get_shipping_address_1();
                }
            }
        }
        
        // Prepare packages
        $packages = array();
        $package_number = 1;
        
        foreach ($order->get_items() as $item) {
            $product = $item->get_product();
            $quantity = $item->get_quantity();
            
            for ($i = 0; $i < $quantity; $i++) {
                $weight = floatval($product->get_weight()) ?: 500; // Default 500g
                $length = floatval($product->get_length()) ?: 10;
                $width = floatval($product->get_width()) ?: 10;
                $height = floatval($product->get_height()) ?: 10;
                
                $packages[] = array(
                    'number' => (string)$package_number,
                    'weight' => intval($weight),
                    'length' => intval($length),
                    'width' => intval($width),
                    'height' => intval($height),
                    'items' => array(
                        array(
                            'name' => $product->get_name(),
                            'ware_key' => $product->get_sku() ?: $product->get_id(),
                            'payment' => array(
                                'value' => floatval($item->get_subtotal())
                            ),
                            'cost' => floatval($item->get_subtotal()),
                            'weight' => intval($weight),
                            'amount' => 1
                        )
                    )
                );
                $package_number++;
            }
        }
        
        // Prepare order data
        $order_data = array(
            'number' => $order->get_order_number(),
            'tariff_code' => intval($tariff_code),
            'sender' => $sender_data,
            'recipient' => $recipient_data,
            'from_location' => array(
                'city' => $from_city
            ),
            'to_location' => $to_location,
            'packages' => $packages
        );
        
        return $order_data;
    }
    
    /**
     * Add CDEK meta box to order edit page
     */
    public function add_cdek_meta_box() {
        add_meta_box(
            'cdek-order-info',
            'CDEK Доставка',
            array($this, 'render_cdek_meta_box'),
            'shop_order',
            'side',
            'high'
        );
    }
    
    /**
     * Render CDEK meta box
     */
    public function render_cdek_meta_box($post) {
        $order_id = $post->ID;
        $is_cdek_order = get_post_meta($order_id, '_is_cdek_order', true);
        
        if (!$is_cdek_order) {
            echo '<p>Это не заказ CDEK</p>';
            return;
        }
        
        $cdek_uuid = get_post_meta($order_id, '_cdek_order_uuid', true);
        $cdek_number = get_post_meta($order_id, '_cdek_order_number', true);
        $tariff_name = get_post_meta($order_id, '_cdek_tariff_name', true);
        $pickup_point = get_post_meta($order_id, '_cdek_pickup_point', true);
        
        echo '<table class="form-table">';
        
        if ($cdek_uuid) {
            echo '<tr><td><strong>UUID CDEK:</strong></td><td>' . esc_html($cdek_uuid) . '</td></tr>';
        }
        
        if ($cdek_number) {
            echo '<tr><td><strong>Номер CDEK:</strong></td><td>' . esc_html($cdek_number) . '</td></tr>';
        }
        
        if ($tariff_name) {
            echo '<tr><td><strong>Тариф:</strong></td><td>' . esc_html($tariff_name) . '</td></tr>';
        }
        
        if ($pickup_point) {
            echo '<tr><td><strong>Пункт выдачи:</strong></td><td>' . esc_html($pickup_point) . '</td></tr>';
        }
        
        echo '</table>';
        
        if (!$cdek_uuid) {
            echo '<p><button type="button" class="button" onclick="createCDEKOrder(' . $order_id . ')">Создать заказ в CDEK</button></p>';
        } else {
            echo '<p><button type="button" class="button" onclick="getCDEKOrderStatus(\'' . $cdek_uuid . '\')">Обновить статус</button></p>';
        }
        
        echo '<div id="cdek-order-result"></div>';
        
        ?>
        <script>
        function createCDEKOrder(orderId) {
            var button = event.target;
            button.disabled = true;
            button.textContent = 'Создание...';
            
            jQuery.ajax({
                url: ajaxurl,
                type: 'POST',
                data: {
                    action: 'create_cdek_order',
                    order_id: orderId,
                    nonce: '<?php echo wp_create_nonce('cdek_order_action'); ?>'
                },
                success: function(response) {
                    if (response.success) {
                        location.reload();
                    } else {
                        jQuery('#cdek-order-result').html('<div class="notice notice-error"><p>' + response.data + '</p></div>');
                    }
                },
                complete: function() {
                    button.disabled = false;
                    button.textContent = 'Создать заказ в CDEK';
                }
            });
        }
        
        function getCDEKOrderStatus(uuid) {
            jQuery.ajax({
                url: ajaxurl,
                type: 'POST',
                data: {
                    action: 'get_cdek_order_status',
                    uuid: uuid,
                    nonce: '<?php echo wp_create_nonce('cdek_order_action'); ?>'
                },
                success: function(response) {
                    if (response.success) {
                        jQuery('#cdek-order-result').html('<div class="notice notice-success"><p>Статус: ' + response.data.status + '</p></div>');
                    } else {
                        jQuery('#cdek-order-result').html('<div class="notice notice-error"><p>' + response.data + '</p></div>');
                    }
                }
            });
        }
        </script>
        <?php
    }
    
    /**
     * AJAX create CDEK order
     */
    public function ajax_create_cdek_order() {
        check_ajax_referer('cdek_order_action', 'nonce');
        
        if (!current_user_can('edit_shop_orders')) {
            wp_send_json_error('Недостаточно прав');
        }
        
        $order_id = intval($_POST['order_id']);
        $uuid = $this->create_cdek_order($order_id);
        
        if ($uuid) {
            wp_send_json_success('Заказ создан в CDEK');
        } else {
            wp_send_json_error('Ошибка создания заказа в CDEK');
        }
    }
    
    /**
     * AJAX get CDEK order status
     */
    public function ajax_get_cdek_order_status() {
        check_ajax_referer('cdek_order_action', 'nonce');
        
        if (!current_user_can('edit_shop_orders')) {
            wp_send_json_error('Недостаточно прав');
        }
        
        $uuid = sanitize_text_field($_POST['uuid']);
        
        include_once CDEK_SHIPPING_PLUGIN_DIR . 'includes/class-cdek-api.php';
        $cdek_api = new CDEK_API();
        
        $order_info = $cdek_api->get_order($uuid);
        
        if ($order_info) {
            wp_send_json_success($order_info);
        } else {
            wp_send_json_error('Не удалось получить информацию о заказе');
        }
    }
}

// Initialize order handler
new CDEK_Order_Handler();