require('dotenv').config();
const express = require('express');
const { createClient } = require('@supabase/supabase-js');

function nowMexico() {
  return new Date().toLocaleString('sv-SE', {
    timeZone: 'America/Mexico_City'
  }).replace(' ', 'T');
}

const app = express();
app.use(express.json());
// --- Supabase client ---
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// =============================================
// PASO 4: Webhook verification
// =============================================
app.get('/webhook', (req, res) => {
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.VERIFY_TOKEN) {
    console.log('✅ Webhook verificado correctamente');
    res.status(200).send(challenge);
  } else {
    console.log('❌ Token incorrecto');
    res.sendStatus(403);
  }
});
// GET /api/mensajes - returns latest messages with sender info
app.get('/api/mensajes', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('mensajes')
      .select('id, telefono, mensaje, fecha_hora')
      .order('fecha_hora', { ascending: false })
      .limit(100);

    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener mensajes' });
  }
});
const path = require('path');
app.use(express.static(path.join(__dirname, 'public')));
// =============================================
// PASO 5-12: Receive and save messages
// =============================================
app.post('/webhook', async (req, res) => {
  // Always respond to Meta immediately
  res.sendStatus(200);

  try {
    const body = req.body;
    console.log('📨 Payload recibido:', JSON.stringify(body, null, 2));

    if (body.object !== 'whatsapp_business_account') {
      console.log('⚠️ No es un mensaje de WhatsApp Business, ignorando.');
      return;
    }

    const messages = body.entry?.[0]?.changes?.[0]?.value?.messages;

    if (!messages || messages.length === 0) {
      console.log('⚠️ No hay mensajes en el payload.');
      return;
    }

    const message = messages[0];

    if (message.type !== 'text') {
      console.log('⚠️ Mensaje no es texto, ignorando.');
      return;
    }

    const telefono = message.from;
    const mensaje  = message.text?.body;

    // --- PASO 6 ---
    console.log('📱 Teléfono:', telefono);
    console.log('💬 Mensaje:', mensaje);

    // --- PASO 7: Check if user exists ---
    const { data: usuarioExistente, error: buscarError } = await supabase
      .from('usuarios')
      .select('telefono')
      .eq('telefono', telefono)
      .maybeSingle();

    if (buscarError) {
      console.error('❌ Error buscando usuario:', buscarError.message);
      return;
    }

    if (!usuarioExistente) {
      const { error: crearError } = await supabase
        .from('usuarios')
        .insert({ telefono, fecha_registro: nowMexico() });

      if (crearError) console.error('❌ Error creando usuario:', crearError.message);
      else console.log('👤 Nuevo usuario registrado:', telefono);
    } else {
      console.log('👤 Usuario ya existe:', telefono);
    }

    // --- PASO 8: Save message ---
    const { error: msgError } = await supabase
      .from('mensajes')
      .insert({ telefono, mensaje, fecha_hora: nowMexico() });

    if (msgError) console.error('❌ Error guardando mensaje:', msgError.message);
    else console.log('✅ Mensaje guardado en Supabase');

  } catch (err) {
    console.error('❌ Error inesperado:', err.message);
  }
});

// =============================================
// PASO 10-11: Simple history screen
// Visit: /historial/5213312345678
// =============================================
app.get('/historial/:telefono', async (req, res) => {
  const telefono = decodeURIComponent(req.params.telefono);

  const { data: mensajes, error } = await supabase
    .from('mensajes')
    .select('*')
    .eq('telefono', telefono)
    .order('fecha_hora', { ascending: true });

  if (error) return res.status(500).send('Error al obtener mensajes');
  if (!mensajes || mensajes.length === 0) {
    return res.send(`<p>No hay mensajes para el teléfono ${telefono}</p>`);
  }

  let html = `<h2>Teléfono: ${telefono}</h2><p><strong>Mensajes:</strong></p><pre>`;
  mensajes.forEach(m => {
    const fecha = new Date(m.fecha_hora).toLocaleString('es-MX');
    html += `[${fecha}] ${m.mensaje}\n`;
  });
  html += `</pre>`;

  res.send(html);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
});
