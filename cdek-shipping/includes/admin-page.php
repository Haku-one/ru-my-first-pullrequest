<?php

if (!defined('ABSPATH')) {
    exit;
}

// Handle form submission
if (isset($_POST['submit']) && wp_verify_nonce($_POST['cdek_settings_nonce'], 'cdek_settings')) {
    update_option('cdek_account', sanitize_text_field($_POST['cdek_account']));
    update_option('cdek_password', sanitize_text_field($_POST['cdek_password']));
    update_option('cdek_yandex_api_key', sanitize_text_field($_POST['cdek_yandex_api_key']));
    update_option('cdek_test_mode', isset($_POST['cdek_test_mode']) ? 1 : 0);
    
    echo '<div class="notice notice-success"><p>Настройки сохранены!</p></div>';
}

$account = get_option('cdek_account', 'Lr7x5fauu0eOXDA4hlK04HiMUpqHgzzR');
$password = get_option('cdek_password', 'fzwKqoaKaTrwRjxVhf6csNzTefyHRHYM');
$yandex_api_key = get_option('cdek_yandex_api_key', '4020b4d5-1d96-476c-a10e-8ab18f0f3702');
$test_mode = get_option('cdek_test_mode', false);

?>

<div class="wrap">
    <h1>CDEK Shipping Settings</h1>
    
    <form method="post" action="">
        <?php wp_nonce_field('cdek_settings', 'cdek_settings_nonce'); ?>
        
        <table class="form-table">
            <tr>
                <th scope="row">
                    <label for="cdek_account">CDEK Account ID</label>
                </th>
                <td>
                    <input type="text" id="cdek_account" name="cdek_account" value="<?php echo esc_attr($account); ?>" class="regular-text" />
                    <p class="description">Идентификатор аккаунта CDEK</p>
                </td>
            </tr>
            
            <tr>
                <th scope="row">
                    <label for="cdek_password">CDEK Password</label>
                </th>
                <td>
                    <input type="password" id="cdek_password" name="cdek_password" value="<?php echo esc_attr($password); ?>" class="regular-text" />
                    <p class="description">Пароль для API CDEK</p>
                </td>
            </tr>
            
            <tr>
                <th scope="row">
                    <label for="cdek_yandex_api_key">Yandex Maps API Key</label>
                </th>
                <td>
                    <input type="text" id="cdek_yandex_api_key" name="cdek_yandex_api_key" value="<?php echo esc_attr($yandex_api_key); ?>" class="regular-text" />
                    <p class="description">API ключ Яндекс.Карт для геокодирования</p>
                </td>
            </tr>
            
            <tr>
                <th scope="row">
                    <label for="cdek_test_mode">Test Mode</label>
                </th>
                <td>
                    <input type="checkbox" id="cdek_test_mode" name="cdek_test_mode" value="1" <?php checked($test_mode, 1); ?> />
                    <label for="cdek_test_mode">Использовать тестовое API CDEK</label>
                    <p class="description">Включите для тестирования на интеграционной среде CDEK</p>
                </td>
            </tr>
        </table>
        
        <?php submit_button('Сохранить настройки'); ?>
    </form>
    
    <h2>Информация о настройке</h2>
    <div class="card">
        <h3>Настройка зон доставки</h3>
        <p>Для корректной работы плагина необходимо:</p>
        <ol>
            <li>Перейти в <strong>WooCommerce > Настройки > Доставка</strong></li>
            <li>Создать зону доставки для России</li>
            <li>Добавить метод доставки "CDEK Shipping" в эту зону</li>
            <li>Настроить параметры метода доставки</li>
        </ol>
        
        <h3>Удаление полей из формы</h3>
        <p>Плагин автоматически скрывает следующие поля в форме адреса доставки:</p>
        <ul>
            <li>Населённый пункт</li>
            <li>Область / район</li>
            <li>Почтовый индекс</li>
        </ul>
        <p>Город определяется автоматически из поля "Адрес" и используется для поиска пунктов выдачи CDEK.</p>
    </div>
    
    <h2>Тест соединения</h2>
    <div class="card">
        <button type="button" id="test-cdek-connection" class="button">Проверить соединение с CDEK API</button>
        <div id="test-result" style="margin-top: 10px;"></div>
    </div>
</div>

<script>
jQuery(document).ready(function($) {
    $('#test-cdek-connection').click(function() {
        var button = $(this);
        var result = $('#test-result');
        
        button.prop('disabled', true).text('Проверка...');
        result.html('');
        
        $.ajax({
            url: ajaxurl,
            type: 'POST',
            data: {
                action: 'test_cdek_connection',
                nonce: '<?php echo wp_create_nonce('test_cdek_connection'); ?>'
            },
            success: function(response) {
                if (response.success) {
                    result.html('<div class="notice notice-success inline"><p>✅ Соединение установлено успешно!</p></div>');
                } else {
                    result.html('<div class="notice notice-error inline"><p>❌ Ошибка: ' + response.data + '</p></div>');
                }
            },
            error: function() {
                result.html('<div class="notice notice-error inline"><p>❌ Ошибка при выполнении запроса</p></div>');
            },
            complete: function() {
                button.prop('disabled', false).text('Проверить соединение с CDEK API');
            }
        });
    });
});
</script>

<?php

// Add AJAX handler for connection test
add_action('wp_ajax_test_cdek_connection', 'test_cdek_connection');

function test_cdek_connection() {
    check_ajax_referer('test_cdek_connection', 'nonce');
    
    if (!current_user_can('manage_options')) {
        wp_send_json_error('Недостаточно прав');
    }
    
    include_once CDEK_SHIPPING_PLUGIN_DIR . 'includes/class-cdek-api.php';
    $cdek_api = new CDEK_API();
    
    $test_city = $cdek_api->get_city_by_name('Москва');
    
    if ($test_city) {
        wp_send_json_success('API работает корректно. Найден город: ' . $test_city['city']);
    } else {
        wp_send_json_error('Не удалось получить данные от API CDEK');
    }
}