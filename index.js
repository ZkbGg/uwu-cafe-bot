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
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
});

// ===============================
// 🍃 MONGODB
// ===============================
let db;
let empleados;
let turnos;
let turnosActivos;

async function conectarDB() {
  const mongo = new MongoClient(MONGO_URI);
  await mongo.connect();

  db = mongo.db("uwuCafe");

  empleados = db.collection("empleados");
  turnos = db.collection("turnos");
  turnosActivos = db.collection("turnosActivos");

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

  const texto = lista.map(t => {
    const inicio = new Date(t.inicio).toLocaleString("es-AR");
    const fin = new Date(t.fin).toLocaleString("es-AR");

    const h = Math.floor(t.duracionMin / 60);
    const m = t.duracionMin % 60;

    return `🗓 ${inicio} → ${fin} (${h}h ${m}m)`;
  }).join("\n");

  return interaction.reply({
    content: `📋 **Turnos de ${nombre}**\n\n${texto}`,
    ephemeral: true // 👈 SOLO LO VE EL ADMIN
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

  const emp = await empleados.findOne({ nombre });

  let total = emp?.totalMinutos || 0;

  if (operacion === "sumar") total += ajuste;
  if (operacion === "restar") total -= ajuste;
  if (operacion === "reemplazar") total = ajuste;

  if (total < 0) total = 0;

  await empleados.updateOne(
    { nombre },
    { $set: { totalMinutos: total } },
    { upsert: true }
  );

  const h = Math.floor(total / 60);
  const m = total % 60;

  return interaction.reply(`✏️ **${nombre}** → ${h}h ${m}m`);
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

  return interaction.reply(
    `💰 Ganancia de **${nombre}** → $${ganancia.toLocaleString("es-AR")}`
  );
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
  if (!interaction.isButton()) return;

  const empleado = interaction.channel.name;
  const userId = interaction.user.id;

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

    return interaction.reply({
      content: `🟢 Turno iniciado para **${empleado}**`,
      ephemeral: true
    });
  }

  // 🔴 FINALIZAR TURNO
  if (interaction.customId === "finalizar_turno") {
    const activo = await turnosActivos.findOne({ discordId: userId });

    if (!activo) {
      return interaction.reply({
        content: "⚠️ No hay turno activo.",
        ephemeral: true
      });
    }

    const inicio = new Date(activo.inicio);
    const fin = new Date();
    const minutos = Math.floor((fin - inicio) / 60000);

    await turnosActivos.deleteOne({ discordId: userId });

    await turnos.insertOne({
      empleado,
      inicio,
      fin,
      duracionMin: minutos,
      discordId: userId
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

    const h = Math.floor(minutos / 60);
    const m = minutos % 60;

    return interaction.reply({
      content: `🔴 Turno finalizado\n⏱ ${h}h ${m}m`,
      ephemeral: true
    });
  }
});

// ===============================
// 🚀 INICIO
// ===============================
(async () => {
  await conectarDB();
  client.login(TOKEN);
})();
