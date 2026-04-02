require("dotenv").config();
const { MongoClient } = require("mongodb");
const {
  Client,
  GatewayIntentBits,
  Events,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require("discord.js");

const TOKEN = process.env.TOKEN;
const MONGO_URI = process.env.MONGO_URI;

// ===============================
// 🤖 DISCORD CLIENT
// ===============================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent // 👈 necesario para leer el contenido
  ]
});

// ===============================
// 🍃 MONGODB
// ===============================
let db;
let empleados;
let turnos;
let turnosActivos;
let canjes;
const timersTurnos = new Map();
const timersInactividad = new Map();
let convenios; // nueva colección
const CANALES_CONVENIO = {
  "1485904206664568863": "pdlc",
  "1486977989437816842": "pba",
};
const CANAL_CREAR_CANJE  = "1489156549300584458";   // canal donde se crean los canjes (solo para avisos, no se lee el contenido)
const CANAL_CANJEAR      = "1489156579260633148"; // canal donde se hacen los canjes (se lee el contenido para validar códigos)

async function programarChequeoTurno(discordId, empleado, canalId, delay = 2 * 60 * 60 * 1000) {

  // 🧹 cancelar timer de aviso anterior
  if (timersTurnos.has(discordId)) {
    clearTimeout(timersTurnos.get(discordId));
    timersTurnos.delete(discordId);
  }

  const timeoutAviso = setTimeout(async () => {
    const activo = await turnosActivos.findOne({ discordId });
    if (!activo) return;

    const canal = await client.channels.fetch(canalId);

    const fila = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("seguir_turno")
        .setLabel("✅ Sigo en servicio")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId("terminar_turno_auto")
        .setLabel("❌ Finalizar turno")
        .setStyle(ButtonStyle.Danger)
    );

    await canal.send({
      content: `⏰ <@${discordId}>, ¿seguís en servicio?`,
      allowedMentions: { users: [discordId] },
      components: [fila]
    });

    // ===============================
    // ⌛ TIMER DE INACTIVIDAD (5 MIN)
    // ===============================

    // 🧹 cancelar uno anterior si existía
    if (timersInactividad.has(discordId)) {
      clearTimeout(timersInactividad.get(discordId));
      timersInactividad.delete(discordId);
    }

    const timeoutInactividad = setTimeout(async () => {
      const sigueActivo = await turnosActivos.findOne({ discordId });
      if (!sigueActivo) return;

      const minutos = await finalizarTurnoAutomatico(discordId, empleado, canal);

      if (minutos !== null) {
        const h = Math.floor(minutos / 60);
        const m = minutos % 60;

        canal.send(`⌛ Turno de **${empleado}** cerrado por inactividad. Total: **${h}h ${m}m**.`);
      }

      timersInactividad.delete(discordId);

    }, 5 * 60 * 1000);

    timersInactividad.set(discordId, timeoutInactividad);

  }, delay);

  timersTurnos.set(discordId, timeoutAviso);
}
async function finalizarTurnoAutomatico(discordId, empleado, canal) {
  try {
    const activo = await turnosActivos.findOne({ discordId });
    if (!activo) return null; // 👈 no había turno

    const inicio = new Date(activo.inicio);
    const fin = new Date();
    const minutos = Math.floor((fin - inicio) / 60000);

    await turnosActivos.deleteOne({ discordId });

    await turnos.insertOne({
      empleado,
      inicio,
      fin,
      duracionMin: minutos,
      discordId
    });

    const bloques = Math.floor(minutos / 180);
    const pago = bloques * 12000;

    await empleados.updateOne(
      { nombre: empleado },
      {
        $inc: {
          totalMinutos: minutos,
          ganancia: pago
        }
      },
      { upsert: true }
    );

// 🧹 limpiar timers
if (timersTurnos.has(discordId)) {
  clearTimeout(timersTurnos.get(discordId));
  timersTurnos.delete(discordId);
}

if (timersInactividad.has(discordId)) {
  clearTimeout(timersInactividad.get(discordId));
  timersInactividad.delete(discordId);
}

    return minutos; // 👈 devolvemos duración real

  } catch (err) {
    console.error("❌ Error al finalizar turno:", err);
    return null;
  }
}

async function conectarDB() {
  const mongo = new MongoClient(MONGO_URI);
  await mongo.connect();

  db = mongo.db("uwuCafe");

  empleados = db.collection("empleados");
  turnos = db.collection("turnos");
  turnosActivos = db.collection("turnosActivos");
  convenios = db.collection("convenios"); // nueva colección
  canjes = db.collection("canjes");
  // Evita duplicar turnos activos
  await turnosActivos.createIndex({ discordId: 1 }, { unique: true });

  console.log("✅ Conectado a MongoDB");
}

// ===============================
// 🤖 BOT LISTO
// ===============================
client.once(Events.ClientReady, () => {
  console.log(`☕ Bot listo como ${client.user.tag}`);
});

// ===============================
// 🎛️ COMANDOS SLASH
// ===============================
client.on(Events.InteractionCreate, async interaction => {

  // ===============================
  // COMANDOS
  // ===============================
  if (interaction.isChatInputCommand()) {

    // 🧵 CREAR EMPLEADO
    if (interaction.commandName === "crear_empleado") {
      const nombre = interaction.options.getString("nombre");

      await empleados.updateOne(
        { nombre },
        { $setOnInsert: { nombre, totalMinutos: 0 } },
        { upsert: true }
      );

      const hilo = await interaction.channel.threads.create({
        name: nombre,
        autoArchiveDuration: 1440
      });

      const fila = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("iniciar_turno")
          .setLabel("🟢 Iniciar turno")
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId("finalizar_turno")
          .setLabel("🔴 Finalizar turno")
          .setStyle(ButtonStyle.Danger)
      );

      await hilo.send({
        content: `☕ Panel de turnos - ${nombre}`,
        components: [fila]
      });

      return interaction.reply({
        content: `✅ Empleado **${nombre}** creado`,
        ephemeral: true
      });
    }

// 🎟️ CREAR CÓDIGO DE CANJE
if (interaction.commandName === "crear_canje") {
  if (!interaction.member.permissions.has("Administrator")) {
    return interaction.reply({ content: "❌ Solo administradores.", ephemeral: true });
  }

  const premio = interaction.options.getString("premio");

  // Generar código xxx-xxx-xxx
  const rand = () => Math.random().toString(36).substring(2, 5).toUpperCase();
  const codigo = `${rand()}-${rand()}-${rand()}`;

  await canjes.insertOne({
    codigo,
    premio,
    usado: false,
    creadoEn: new Date()
  });

  // Mandar al canal #crear_canje
  const canalCrear = await client.channels.fetch(CANAL_CREAR_CANJE);
  await canalCrear.send(
    `🎟️ Nuevo código creado\n` +
    `📦 Premio: **${premio}**\n` +
    `🔑 Código: \`${codigo}\``
  );

  return interaction.reply({
    content: `✅ Código \`${codigo}\` creado para **${premio}**`,
    ephemeral: true
  });
}

// 📋 VER CANJES ACTIVOS
if (interaction.commandName === "ver_canjes") {
  const lista = await canjes.find({ usado: false }).toArray();

  if (!lista.length) {
    return interaction.reply({ content: "😴 No hay códigos activos.", ephemeral: true });
  }

  const texto = lista.map(c =>
    `\`${c.codigo}\` — **${c.premio}**`
  ).join("\n");

  return interaction.reply({
    content: `🎟️ **Códigos activos:**\n\n${texto}`,
    ephemeral: true
  });
}


// 💰 CARGAR CONVENIO
if (interaction.commandName === "convenio_cargar") {
  if (!interaction.member.permissions.has("Administrator")) {
    return interaction.reply({ content: "❌ Solo administradores.", ephemeral: true });
  }

  const nombreConvenio = interaction.options.getString("convenio");
  const monto = interaction.options.getInteger("monto");

  await convenios.updateOne(
    { nombre: nombreConvenio },
    { $set: { saldo: monto, nombre: nombreConvenio } },
    { upsert: true }
  );

  return interaction.reply({
    content: `✅ Convenio **${nombreConvenio.toUpperCase()}** cargado con **${monto}** combos.`,
    ephemeral: true
  });
}

// 👀 VER SALDO CONVENIO
if (interaction.commandName === "convenio_ver") {
  const nombreConvenio = interaction.options.getString("convenio");
  const convenio = await convenios.findOne({ nombre: nombreConvenio });

  if (!convenio) {
    return interaction.reply({ content: "⚠️ No hay convenio cargado aún.", ephemeral: true });
  }

  return interaction.reply({
    content: `🚔 Convenio **${nombreConvenio.toUpperCase()}** — Saldo: **${convenio.saldo}** combos`,
    ephemeral: true
  });
}

    // ⏱ HORAS TOTALES
    if (interaction.commandName === "horas_totales") {
      const nombre = interaction.options.getString("nombre");
      const emp = await empleados.findOne({ nombre });

      if (!emp) {
        return interaction.reply(`❌ No existe **${nombre}**`);
      }

      const horas = Math.floor(emp.totalMinutos / 60);
      const minutos = emp.totalMinutos % 60;

      return interaction.reply(`⏱ **${nombre}** trabajó ${horas}h ${minutos}m`);
    }

    // 🔴 FORZAR CIERRE DE TURNO (ADMIN)
if (interaction.commandName === "terminar_turno") {

  if (!interaction.member.permissions.has("Administrator")) {
    return interaction.reply({
      content: "❌ Solo administradores.",
      ephemeral: true
    });
  }

  const nombre = interaction.options.getString("nombre");

  // buscar turno activo por nombre
  const turnoActivo = await turnosActivos.findOne({ empleado: nombre });

  if (!turnoActivo) {
    return interaction.reply({
      content: `⚠️ **${nombre}** no tiene un turno activo.`,
      ephemeral: true
    });
  }

  const minutos = await finalizarTurnoAutomatico(
    turnoActivo.discordId,
    nombre,
    interaction.channel
  );

  if (minutos === null) {
    return interaction.reply({
      content: "⚠️ No se pudo cerrar el turno.",
      ephemeral: true
    });
  }

  const h = Math.floor(minutos / 60);
  const m = minutos % 60;

  return interaction.reply({
    content: `🔴 Turno de **${nombre}** cerrado.\n⏱ Tiempo trabajado: **${h}h ${m}m**`,
    ephemeral: true
  });
}

// 📋 REGISTRO DE TURNOS (SOLO ADMIN)
if (interaction.commandName === "registro") {

  // 🔐 Verificar permisos
  if (!interaction.member.permissions.has("Administrator")) {
    return interaction.reply({
      content: "❌ Solo administradores pueden ver el registro.",
      ephemeral: true
    });
  }

  const nombre = interaction.options.getString("nombre");

  const lista = await turnos
    .find({ empleado: nombre })
    .sort({ inicio: -1 })
    .toArray();

  if (!lista.length) {
    return interaction.reply({
      content: `❌ No hay turnos registrados para **${nombre}**`,
      ephemeral: true
    });
  }

  // 🕒 Opciones de formato Argentina
  const opcionesFecha = {
    timeZone: "America/Argentina/Buenos_Aires",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  };

  const texto = lista.map(t => {
    const inicio = new Date(t.inicio).toLocaleString("es-AR", opcionesFecha);
    const fin = new Date(t.fin).toLocaleString("es-AR", opcionesFecha);

    const h = Math.floor(t.duracionMin / 60);
    const m = t.duracionMin % 60;

    return `🗓 ${inicio} → ${fin} (${h}h ${m}m)`;
  }).join("\n");

  return interaction.reply({
    content: `📋 **Turnos de ${nombre}**\n\n${texto}`,
    ephemeral: true // 👈 SOLO LO VE EL ADMIN
  });
}

// 🧾 BORRAR HISTORIAL DE TURNOS
if (interaction.commandName === "registros_borrar") {

  // 🔐 solo admins
  if (!interaction.member.permissions.has("Administrator")) {
    return interaction.reply({
      content: "❌ Solo administradores pueden usar este comando.",
      ephemeral: true
    });
  }

  const resultado = await turnos.deleteMany({});

  return interaction.reply({
    content: `🧾 Historial de turnos eliminado (${resultado.deletedCount} registros).`,
    ephemeral: true
  });
}

    // 🏆 RANKING
if (interaction.commandName === "ranking") {
  const lista = await empleados.find().sort({ totalMinutos: -1 }).toArray();

  if (!lista.length) {
    return interaction.reply("No hay datos todavía.");
  }

  const texto = lista.map((e, i) => {
    const total = e.totalMinutos || 0;
    const h = Math.floor(total / 60);
    const m = total % 60;
    return `**${i + 1}. ${e.nombre}** — ${h}h ${m}m`;
  }).join("\n");

  return interaction.reply(`🏆 **Ranking**\n\n${texto}`);
}

// ✏️ EDITAR HORAS
if (interaction.commandName === "editar_horas") {
  if (!interaction.member.permissions.has("Administrator")) {
    return interaction.reply({
      content: "❌ Solo administradores.",
      ephemeral: true
    });
  }

  const nombre = interaction.options.getString("nombre");
  const horas = interaction.options.getInteger("horas") || 0;
  const minutos = interaction.options.getInteger("minutos") || 0;
  const operacion = interaction.options.getString("operacion");

  const ajuste = horas * 60 + minutos;

 const turnoActivo = await turnosActivos.findOne({ empleado: nombre });
  const emp = await empleados.findOne({ nombre });

  let total = emp?.totalMinutos || 0;

  // ============================
  // 🔥 SI HAY TURNO ACTIVO
  // ============================
  if (turnoActivo) {
    const ahora = new Date();
    let nuevoInicio = new Date(turnoActivo.inicio);

    if (operacion === "reemplazar") {
      nuevoInicio = new Date(ahora.getTime() - ajuste * 60000);
    }

    if (operacion === "sumar") {
      nuevoInicio = new Date(nuevoInicio.getTime() - ajuste * 60000);
    }

    if (operacion === "restar") {
      nuevoInicio = new Date(nuevoInicio.getTime() + ajuste * 60000);
    }

await turnosActivos.updateOne(
  { discordId: turnoActivo.discordId },
  { $set: { inicio: nuevoInicio } }
);

// 🔁 recalcular aviso de 2 horas correctamente
const tiempoTranscurrido = ahora - nuevoInicio;
const tiempoRestante = (2 * 60 * 60 * 1000) - tiempoTranscurrido;

await programarChequeoTurno(
  turnoActivo.discordId,
  nombre,
  interaction.channel.id,
  tiempoRestante > 0 ? tiempoRestante : 1000
);

  } else {
    // ============================
    // 📊 SI NO HAY TURNO ACTIVO
    // ============================
    if (operacion === "sumar") total += ajuste;
    if (operacion === "restar") total -= ajuste;
    if (operacion === "reemplazar") total = ajuste;

    if (total < 0) total = 0;

    await empleados.updateOne(
      { nombre },
      { $set: { totalMinutos: total } },
      { upsert: true }
    );
  }

  const h = Math.floor(total / 60);
  const m = total % 60;

  return interaction.reply({
    content: `✏️ **${nombre}** actualizado.`,
    ephemeral: true
  });

}

    // 🔄 RESET RANKING
    if (interaction.commandName === "resetear_ranking") {
      if (!interaction.member.permissions.has("Administrator")) {
        return interaction.reply({
          content: "❌ Sin permisos.",
          ephemeral: true
        });
      }

      await empleados.updateMany({}, { $set: { totalMinutos: 0 } });
      await turnos.deleteMany({});
      await turnosActivos.deleteMany({});

      return interaction.reply("✅ Ranking reiniciado.");
    }

    // 👀 QUIÉN ESTÁ EN TURNO
    if (interaction.commandName === "quien_esta_en_turno") {
      const activos = await turnosActivos.find().toArray();

      if (!activos.length) {
        return interaction.reply("😴 Nadie está en turno.");
      }

      const texto = activos.map(a => `🟢 ${a.empleado}`).join("\n");
      return interaction.reply(`👨‍🍳 En turno:\n\n${texto}`);
    }

if (interaction.commandName === "mi_ganancia") {
  const empleado = interaction.channel.name;
  const emp = await empleados.findOne({ nombre: empleado });

  const ganancia = emp?.ganancia || 0;

  return interaction.reply({
    content: `💰 Tu ganancia: **$${ganancia.toLocaleString("es-AR")}**`,
    ephemeral: true
  });
}


if (interaction.commandName === "ganancias_totales") {
  if (!interaction.member.permissions.has("Administrator")) {
    return interaction.reply({
      content: "❌ Solo administradores.",
      ephemeral: true
    });
  }

  const lista = await empleados.find().toArray();

  let total = 0;

  const detalle = lista.map(e => {
    const ganancia = e.ganancia || 0;
    total += ganancia;
    return `👤 ${e.nombre} — $${ganancia.toLocaleString("es-AR")}`;
  }).join("\n");

  return interaction.reply(
    `💰 **Ganancias totales generadas**\n\n${detalle}\n\n🧾 TOTAL: **$${total.toLocaleString("es-AR")}**`
  );
}

if (interaction.commandName === "editar_ganancia") {
  if (!interaction.member.permissions.has("Administrator")) {
    return interaction.reply({
      content: "❌ Solo administradores.",
      ephemeral: true
    });
  }

  const nombre = interaction.options.getString("nombre");
  const monto = interaction.options.getInteger("monto");
  const operacion = interaction.options.getString("operacion");

  const emp = await empleados.findOne({ nombre });
  let ganancia = emp?.ganancia || 0;

  if (operacion === "sumar") ganancia += monto;
  if (operacion === "restar") ganancia -= monto;
  if (operacion === "resetear") ganancia = 0;

  if (ganancia < 0) ganancia = 0;

  await empleados.updateOne(
    { nombre },
    { $set: { ganancia } },
    { upsert: true }
  );

  return interaction.reply({
      content: `💰 Ganancia de **${nombre}** → $${ganancia.toLocaleString("es-AR")}`,
      ephemeral: true
  });
}
if (interaction.commandName === "resetear_ganancia") {
  const nombre = interaction.options.getString("nombre");

  await empleados.updateOne(
    { nombre },
    { $set: { ganancia: 0 } }
  );

  interaction.reply(`🔄 Ganancia de ${nombre} reseteada a $0`);
}
  }

  // ===============================
  // 🔘 BOTONES
  // ===============================
  if (interaction.isButton()) {

  const empleado = interaction.channel.name;
  const presionadorId = interaction.user.id;

  const turnoActivo = await turnosActivos.findOne({ empleado });

  // 🔒 evitar que otros usen los botones
  if (turnoActivo && turnoActivo.discordId !== presionadorId) {
    return interaction.reply({
      content: "❌ Este botón no es para vos.",
      ephemeral: true
    });
  }

  const userId = turnoActivo?.discordId || presionadorId;

        // ❌ FINALIZAR DESDE AVISO
if (interaction.customId === "terminar_turno_auto") {
  const minutos = await finalizarTurnoAutomatico(userId, empleado, interaction.channel);

  if (minutos === null) {
    return interaction.update({
      content: "⚠️ El turno ya estaba cerrado.",
      components: []
    });
  }

  const h = Math.floor(minutos / 60);
  const m = minutos % 60;

  await interaction.update({
    content: `🔴 Turno finalizado por inactividad. Trabajaste **${h}h ${m}m**.`,
    components: []
  });
}
    // 🟢 INICIAR TURNO
    if (interaction.customId === "iniciar_turno") {
      const activo = await turnosActivos.findOne({ discordId: userId });

      if (activo) {
        return interaction.reply({
          content: "⚠️ Ya tenés un turno activo.",
          ephemeral: true
        });
      }

      await turnosActivos.insertOne({
        discordId: userId,
        empleado,
        inicio: new Date()
      });

      await programarChequeoTurno(userId, empleado, interaction.channel.id);

      return interaction.reply({
        content: `🟢 Turno iniciado para **${empleado}**`,
        ephemeral: true
      });
    }

    // 🔴 FINALIZAR TURNO MANUAL
if (interaction.customId === "finalizar_turno") {
  const minutos = await finalizarTurnoAutomatico(userId, empleado, interaction.channel);

  if (minutos === null) {
    return interaction.reply({
      content: "⚠️ No tenés un turno activo.",
      ephemeral: true
    });
  }

  const h = Math.floor(minutos / 60);
  const m = minutos % 60;

  return interaction.reply({
    content: `🔴 Turno finalizado. Trabajaste **${h}h ${m}m**.`,
    ephemeral: true
  });
}

    // ✅ SIGUE EN TURNO
if (interaction.customId === "seguir_turno") {

  // 🧹 cancelar cierre por inactividad
  if (timersInactividad.has(userId)) {
    clearTimeout(timersInactividad.get(userId));
    timersInactividad.delete(userId);
  }

  await interaction.update({
    content: "👍 Perfecto, el turno continúa.",
    components: []
  });

  // 🔁 reiniciar contador de 2 horas
  await programarChequeoTurno(userId, empleado, interaction.channel.id);
}

    return;
  }
});
 // ===============================
// 💬 MENSAJES — DESCUENTO CONVENIO
// ===============================
// ===============================
// 💬 MENSAJES
// ===============================
client.on(Events.MessageCreate, async message => {
  // 🔒 Ignorar bots SIEMPRE — esto va primero y no se repite
  if (message.author.bot) return;
  if (message.webhookId) return;
  if (message.author.id === client.user?.id) return;

  // ===============================
  // 🎟️ CANJEAR CÓDIGO
  // ===============================
  if (message.channel.id === CANAL_CANJEAR) {
    const contenido = message.content.trim().toUpperCase();

    if (!/^[A-Z0-9]{3}-[A-Z0-9]{3}-[A-Z0-9]{3}$/.test(contenido)) {
      await message.delete().catch(() => {}); // 👈 borra el mensaje inválido en vez de responder
      return;
    }

    const canje = await canjes.findOne({ codigo: contenido });

    if (!canje) {
      await message.delete().catch(() => {});
      return message.channel.send(`❌ <@${message.author.id}> Código inválido o inexistente.`);
    }

    if (canje.usado) {
      await message.delete().catch(() => {});
      return message.channel.send(`❌ <@${message.author.id}> Este código ya fue canjeado.`);
    }

    await canjes.updateOne(
      { codigo: contenido },
      { $set: { usado: true, canjeadoPor: message.author.id, canjeadoEn: new Date() } }
    );

    await message.delete().catch(() => {});
    return message.channel.send(
      `✅ ¡Código canjeado exitosamente!\n` +
      `🎁 Premio: **${canje.premio}**\n` +
      `👤 Canjeado por: <@${message.author.id}>`
    );
  }

  // ===============================
  // 💬 DESCUENTO CONVENIO
  // ===============================
  const nombreConvenio = CANALES_CONVENIO[message.channel.id];
  if (!nombreConvenio) return;

  const numero = parseInt(message.content.trim());
  if (isNaN(numero) || numero <= 0) return;

  const convenio = await convenios.findOne({ nombre: nombreConvenio });

  if (!convenio) {
    return message.reply(`⚠️ No hay convenio cargado. Usá \`/convenio_cargar\` primero.`);
  }

  if (convenio.saldo <= 0) {
    return message.reply("❌ Este convenio no tiene saldo disponible.");
  }

  if (numero > convenio.saldo) {
    return message.reply(`⚠️ No hay suficiente saldo. Saldo actual: **${convenio.saldo}**`);
  }

  const nuevoSaldo = convenio.saldo - numero;

  await convenios.updateOne(
    { nombre: nombreConvenio },
    { $set: { saldo: nuevoSaldo } }
  );

  let estado = "";
  if (nuevoSaldo === 0) estado = "\n🚨 **¡Saldo agotado! Hay que renovar el convenio.**";
  else if (nuevoSaldo <= 20) estado = "\n⚠️ Saldo bajo, avisá para renovar pronto.";

  return message.reply(
    `✅ Se descontaron **${numero}** combos.\n📦 Saldo restante: **${nuevoSaldo}**${estado}`
  );
});
// ===============================
// 🚀 INICIO
// ===============================
(async () => {
  await conectarDB();
  client.login(TOKEN);
})();
