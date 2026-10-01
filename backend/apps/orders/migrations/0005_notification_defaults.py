from django.db import migrations

# Frozen defaults; this migration never queues emails for existing orders.
TEMPLATES = {'placed': ('Comandă plasată',
            'Am primit comanda {{order_number}}',
            'Bună, {{customer_name}}!\n'
            '\n'
            'Am primit comanda ta.\n'
            '{{items}}\n'
            '\n'
            'Total: {{order_total}}\n'
            '{{payment_note}}\n'
            '\n'
            'Îți mulțumim!\n'
            '{{site_name}}'),
 'paid': ('Plată confirmată',
          'Plată confirmată — {{order_number}}',
          'Bună, {{customer_name}}!\n'
          '\n'
          'Am înregistrat plata pentru comanda {{order_number}}, în valoare de {{order_total}}.\n'
          '\n'
          '{{site_name}}'),
 'in_production': ('În producție',
                   'Comanda {{order_number}} este în producție',
                   'Bună, {{customer_name}}!\n'
                   '\n'
                   'Am început lucrul la comanda ta {{order_number}}. Te anunțăm când este gata.\n'
                   '\n'
                   '{{site_name}}'),
 'ready_to_ship': ('Gata de livrare',
                   'Comanda {{order_number}} este gata de livrare',
                   'Bună, {{customer_name}}!\n'
                   '\n'
                   'Comanda ta este gata și o pregătim pentru curier.\n'
                   '\n'
                   '{{site_name}}'),
 'shipped': ('Expediată',
             'Am expediat comanda {{order_number}}',
             'Bună, {{customer_name}}!\n'
             '\n'
             'Comanda a fost expediată.\n'
             'Curier: {{courier}}\n'
             'AWB: {{awb}}\n'
             'Urmărire: {{tracking_url}}\n'
             '\n'
             '{{site_name}}'),
 'completed': ('Finalizată',
               'Comanda {{order_number}} a fost finalizată',
               'Bună, {{customer_name}}!\n'
               '\n'
               'Comanda ta a fost finalizată. Îți mulțumim că ai ales {{site_name}}!'),
 'cancelled': ('Anulată',
               'Comanda {{order_number}} a fost anulată',
               'Bună, {{customer_name}}!\n'
               '\n'
               'Comanda {{order_number}} a fost anulată. Pentru întrebări ne poți răspunde la '
               'acest email.\n'
               '\n'
               '{{site_name}}'),
 'refunded': ('Rambursată',
              'Rambursare înregistrată — {{order_number}}',
              'Bună, {{customer_name}}!\n'
              '\n'
              'Am înregistrat rambursarea pentru comanda {{order_number}}.\n'
              '\n'
              '{{site_name}}'),
 'staff_order': ('Notificare internă: comandă nouă',
                 'Comandă nouă: {{order_number}}',
                 'Client: {{customer_name}}\n'
                 'Email: {{customer_email}}\n'
                 '{{items}}\n'
                 'Total: {{order_total}}\n'
                 '{{payment_note}}\n'
                 '\n'
                 '{{crm_url}}'),
 'invoice': ('Factură',
             'Factura {{invoice_number}} — {{order_number}}',
             'Bună, {{customer_name}}!\n'
             '\n'
             'Găsești atașată factura {{invoice_number}} pentru comanda {{order_number}}.\n'
             'Total: {{order_total}}\n'
             'Scadență: {{due_date}}\n'
             '\n'
             '{{site_name}}'),
 'payment_resume': ('Reluare plată',
                    'Reluare plată — {{order_number}}',
                    'Bună, {{customer_name}}!\n'
                    '\n'
                    'Plata comenzii nu a fost finalizată. O poți relua aici:\n'
                    '{{payment_url}}\n'
                    '\n'
                    '{{site_name}}')}


def seed(apps, schema_editor):
    Template = apps.get_model("orders", "EmailTemplate")
    Config = apps.get_model("orders", "NotificationConfig")
    Config.objects.get_or_create(pk=1)
    for key, (name, subject, body) in TEMPLATES.items():
        Template.objects.get_or_create(key=key, defaults={"name": name, "subject": subject, "body": body})


class Migration(migrations.Migration):
    dependencies = [("orders", "0004_emailtemplate_address_company_name_address_cui_and_more")]
    operations = [migrations.RunPython(seed, migrations.RunPython.noop)]
