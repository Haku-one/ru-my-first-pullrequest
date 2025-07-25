jQuery(document).ready(function($) {
    'use strict';
    
    var cdekShipping = {
        
        init: function() {
            this.hideFields();
            this.bindEvents();
            this.checkShippingMethod();
        },
        
        hideFields: function() {
            // Hide unnecessary fields in both classic and block checkout
            $('.wc-block-components-address-form__city').hide();
            $('.wc-block-components-address-form__state').hide();
            $('.wc-block-components-address-form__postcode').hide();
            
            // For classic checkout
            $('#shipping_city_field, #shipping_state_field, #shipping_postcode_field').hide();
            $('#billing_city_field, #billing_state_field, #billing_postcode_field').hide();
        },
        
        bindEvents: function() {
            var self = this;
            
            // Monitor address changes
            $(document).on('change keyup', '#shipping-address_1, #shipping_address_1', function() {
                self.handleAddressChange($(this).val());
            });
            
            // Monitor shipping method changes
            $(document).on('change', 'input[name^="shipping_method"]', function() {
                self.checkShippingMethod();
            });
            
            // For block checkout
            $(document).on('updated_checkout', function() {
                self.hideFields();
                self.checkShippingMethod();
            });
            
            // For classic checkout
            $('body').on('updated_checkout', function() {
                self.hideFields();
                self.checkShippingMethod();
            });
        },
        
        handleAddressChange: function(address) {
            var city = this.extractCityFromAddress(address);
            
            if (city && city.length > 2) {
                this.loadPickupPoints(city);
            } else {
                this.hidePickupPoints();
            }
        },
        
        extractCityFromAddress: function(address) {
            if (!address) return '';
            
            var parts = address.split(',');
            
            for (var i = 0; i < parts.length; i++) {
                var part = parts[i].trim();
                
                // Remove common prefixes
                part = part.replace(/^(г\.|город|пос\.|поселок|с\.|село)\s*/gi, '');
                
                // Check if it looks like a city name (Cyrillic letters, spaces, hyphens)
                if (/^[а-яё\s\-]+$/i.test(part) && part.length > 2) {
                    return part.trim();
                }
            }
            
            return '';
        },
        
        checkShippingMethod: function() {
            var selectedMethod = $('input[name^="shipping_method"]:checked').val();
            
            if (selectedMethod && selectedMethod.indexOf('cdek_shipping') !== -1) {
                this.showPickupPointsContainer();
                
                // Get city from address
                var address = $('#shipping-address_1').val() || $('#shipping_address_1').val();
                if (address) {
                    this.handleAddressChange(address);
                }
            } else {
                this.hidePickupPointsContainer();
            }
        },
        
        showPickupPointsContainer: function() {
            if ($('#cdek-pickup-points').length === 0) {
                this.createPickupPointsContainer();
            }
            $('#cdek-pickup-points').addClass('show');
        },
        
        hidePickupPointsContainer: function() {
            $('#cdek-pickup-points').removeClass('show');
        },
        
        createPickupPointsContainer: function() {
            var container = $('<div id="cdek-pickup-points" class="cdek-pickup-points">' +
                '<h4>Выберите пункт выдачи CDEK</h4>' +
                '<div id="cdek-pickup-list" class="cdek-pickup-list"></div>' +
                '</div>');
            
            // Try to insert after shipping methods
            var insertAfter = $('.wc-block-components-shipping-rates-control, .woocommerce-shipping-methods, #shipping_method');
            
            if (insertAfter.length > 0) {
                insertAfter.last().after(container);
            } else {
                // Fallback: insert in shipping section
                $('.wc-block-components-address-form, .woocommerce-shipping-fields').append(container);
            }
        },
        
        loadPickupPoints: function(city) {
            var self = this;
            var $list = $('#cdek-pickup-list');
            
            if (!$list.length) return;
            
            $list.html('<div class="cdek-loading"><div class="cdek-spinner"></div>Загрузка пунктов выдачи...</div>');
            
            $.ajax({
                url: cdek_ajax.ajax_url,
                type: 'POST',
                data: {
                    action: 'cdek_get_pickup_points',
                    city: city,
                    nonce: cdek_ajax.nonce
                },
                success: function(response) {
                    if (response.success && response.data) {
                        self.displayPickupPoints(response.data);
                    } else {
                        $list.html('<div class="cdek-error">Пункты выдачи не найдены для города "' + city + '"</div>');
                    }
                },
                error: function() {
                    $list.html('<div class="cdek-error">Ошибка при загрузке пунктов выдачи</div>');
                }
            });
        },
        
        displayPickupPoints: function(pickupPoints) {
            var $list = $('#cdek-pickup-list');
            var html = '';
            
            if (!pickupPoints || pickupPoints.length === 0) {
                $list.html('<div class="cdek-error">Пункты выдачи не найдены</div>');
                return;
            }
            
            for (var i = 0; i < pickupPoints.length; i++) {
                var point = pickupPoints[i];
                var schedule = this.formatSchedule(point.work_time);
                
                html += '<div class="cdek-pickup-item" data-code="' + point.code + '">' +
                    '<input type="radio" name="cdek_pickup_point" value="' + point.code + '" id="pickup_' + point.code + '">' +
                    '<label for="pickup_' + point.code + '">' +
                    '<div class="cdek-pickup-name">' + (point.name || 'Пункт выдачи CDEK') + '</div>' +
                    '<div class="cdek-pickup-address">' + point.location.address_full + '</div>' +
                    '<div class="cdek-pickup-schedule">' + schedule + '</div>' +
                    '</label>' +
                    '</div>';
            }
            
            $list.html(html);
            
            // Bind click events
            $('.cdek-pickup-item').on('click', function() {
                var $radio = $(this).find('input[type="radio"]');
                $radio.prop('checked', true);
                $('.cdek-pickup-item').removeClass('selected');
                $(this).addClass('selected');
                
                // Trigger checkout update
                $('body').trigger('update_checkout');
            });
        },
        
        formatSchedule: function(workTime) {
            if (!workTime || workTime.length === 0) {
                return 'Режим работы не указан';
            }
            
            var schedule = [];
            for (var i = 0; i < workTime.length; i++) {
                var day = workTime[i];
                var dayName = this.getDayName(day.day);
                var time = '';
                
                if (day.time) {
                    time = day.time;
                } else {
                    time = 'Закрыто';
                }
                
                schedule.push(dayName + ': ' + time);
            }
            
            return schedule.join(', ');
        },
        
        getDayName: function(dayNumber) {
            var days = ['', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
            return days[dayNumber] || 'День ' + dayNumber;
        },
        
        hidePickupPoints: function() {
            $('#cdek-pickup-list').empty();
        }
    };
    
    // Initialize when document is ready
    cdekShipping.init();
    
    // Re-initialize on checkout updates
    $(document).on('updated_checkout', function() {
        setTimeout(function() {
            cdekShipping.init();
        }, 100);
    });
    
    // For block checkout
    if (typeof wp !== 'undefined' && wp.hooks) {
        wp.hooks.addAction('experimental__woocommerce_blocks-checkout-render-checkout-form', 'cdek-shipping', function() {
            setTimeout(function() {
                cdekShipping.init();
            }, 500);
        });
    }
});