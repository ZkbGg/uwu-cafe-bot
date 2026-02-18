const fs = require('fs');
const {
  Client,
  GatewayIntentBits,
  Events,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');

const TOKEN = process.env.TOKEN;

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
});

const TURNOS_FILE = './turnos.json';
const turnosActivos = new Map();

// ===============================
// 📁 ARCHIVOS
// ===============================
function cargarTurnos() {
  if (!fs.existsSync(TURNOS_FILE)) return {};
  return JSON.parse(fs.readFileSync(TURNOS_FILE));
}

function guardarTurnos(data) {
  fs.writeFileSync(TURNOS_FILE, JSON.stringify(data, null, 2));
}

function parseDuracion(duracion) {
  const match = duracion.match(/(\d+)h\s(\d+)m/);
  if (!match) return 0;
  return parseInt(match[1]) * 60 + parseInt(match[2]);
}

// ===============================
// 🤖 BOT LISTO
// ===============================
client.once(Events.ClientReady, () => {
  console.log(`Bot listo como ${client.user.tag}`);
});

// ===============================
// 🎛️ INTERACCIONES
// ===============================
client.on(Events.InteractionCreate, async interaction => {


  if (interaction.isChatInputCommand()) {

if (interaction.commandName === 'editar_horas') {

  // 🔐 Verificar permisos primero
  if (!interaction.member.permissions.has('Administrator')) {
    return interaction.reply({
      content: '❌ Solo administradores pueden editar horas.',
      ephemeral: true
    });
  }

  const nombre = interaction.options.getString('nombre');
  const horas = interaction.options.getInteger('horas');
  const minutos = interaction.options.getInteger('minutos');
  const operacion = interaction.options.getString('operacion');

  const turnos = cargarTurnos();

  if (!turnos[nombre]) {
    return interaction.reply({
      content: `❌ No existe el empleado **${nombre}**`,
      ephemeral: true
    });
  }

  // calcular minutos actuales
  let totalMin = turnos[nombre]
    .map(t => parseDuracion(t.duracion))
    .reduce((a, b) => a + b, 0);

  const ajusteMin = horas * 60 + minutos;

  if (operacion === 'sumar') totalMin += ajusteMin;
  if (operacion === 'restar') totalMin -= ajusteMin;
  if (operacion === 'reemplazar') totalMin = ajusteMin;

  if (totalMin < 0) totalMin = 0;

  const nuevasHoras = Math.floor(totalMin / 60);
  const nuevosMin = totalMin % 60;

  // reemplazamos los turnos por uno solo corregido
  turnos[nombre] = [{
    inicio: 'ajuste',
    fin: 'ajuste',
    duracion: `${nuevasHoras}h ${nuevosMin}m`,
    discordId: 'sistema'
  }];

  guardarTurnos(turnos);

  return interaction.reply(
    `✏️ Horas actualizadas para **${nombre}** → ${nuevasHoras}h ${nuevosMin}m`
  );
}


    // 🧵 CREAR EMPLEADO
    if (interaction.commandName === 'crear_empleado') {
      const nombre = interaction.options.getString('nombre');
      const hilo = await interaction.channel.threads.create({
        name: nombre,
        autoArchiveDuration: 1440
      });

      const fila = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('iniciar_turno')
          .setLabel('🟢 Iniciar turno')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('finalizar_turno')
          .setLabel('🔴 Finalizar turno')
          .setStyle(ButtonStyle.Danger)
      );

      await hilo.send({
        content: `☕ Panel de turnos - ${nombre}`,
        components: [fila]
      });

      return interaction.reply({
        content: `✅ Hilo creado para **${nombre}**`,
        ephemeral: true
      });
    }

    // ⏱ HORAS TOTALES
    if (interaction.commandName === 'horas_totales') {
      const nombre = interaction.options.getString('nombre');
      const turnos = cargarTurnos();

      if (!turnos[nombre]) {
        return interaction.reply(`❌ No hay registros para **${nombre}**`);
      }

      const totalMin = turnos[nombre]
        .map(t => parseDuracion(t.duracion))
        .reduce((a, b) => a + b, 0);

      const horas = Math.floor(totalMin / 60);
      const minutos = totalMin % 60;

      return interaction.reply(`⏱ **${nombre}** trabajó ${horas}h ${minutos}m`);
    }

    // 🏆 RANKING
    if (interaction.commandName === 'ranking') {
      const turnos = cargarTurnos();
      const ranking = [];

      for (const empleado in turnos) {
        const totalMin = turnos[empleado]
          .map(t => parseDuracion(t.duracion))
          .reduce((a, b) => a + b, 0);

        ranking.push({ empleado, totalMin });
      }

      if (!ranking.length) {
        return interaction.reply('No hay datos todavía.');
      }

      ranking.sort((a, b) => b.totalMin - a.totalMin);

      const texto = ranking.map((r, i) => {
        const h = Math.floor(r.totalMin / 60);
        const m = r.totalMin % 60;
        return `**${i + 1}. ${r.empleado}** — ${h}h ${m}m`;
      }).join('\n');

      return interaction.reply(`🏆 **Ranking**\n\n${texto}`);
    }
    if (interaction.commandName === 'resetear_ranking') {

  if (!interaction.member.permissions.has('Administrator')) {
    return interaction.reply({
      content: '❌ No tenés permisos para resetear el ranking.',
      ephemeral: true
    });
  }

  guardarTurnos({}); // ← usa tu función existente

  return interaction.reply('✅ Ranking reiniciado correctamente.');
}

  }

  // ===============================
  // 🔘 BOTONES
  // ===============================
  if (!interaction.isButton()) return;

  const threadName = interaction.channel.name;
  const userId = interaction.user.id;
  let turnos = cargarTurnos();

  if (interaction.customId === 'iniciar_turno') {
    if (turnosActivos.has(userId)) {
      return interaction.reply({ content: '⚠️ Ya tenés un turno activo.', ephemeral: true });
    }

    turnosActivos.set(userId, Date.now());
    return interaction.reply({ content: `🟢 Turno iniciado para **${threadName}**`, ephemeral: true });
  }

  if (interaction.customId === 'finalizar_turno') {
    if (!turnosActivos.has(userId)) {
      return interaction.reply({ content: '⚠️ No hay turno activo.', ephemeral: true });
    }

    const inicio = turnosActivos.get(userId);
    const fin = Date.now();
    const minutos = Math.floor((fin - inicio) / 60000);
    const horas = Math.floor(minutos / 60);
    const minsRestantes = minutos % 60;

    turnosActivos.delete(userId);

    if (!turnos[threadName]) turnos[threadName] = [];

    turnos[threadName].push({
      inicio: new Date(inicio).toISOString(),
      fin: new Date(fin).toISOString(),
      duracion: `${horas}h ${minsRestantes}m`,
      discordId: userId
    });

    guardarTurnos(turnos);

    return interaction.reply({
      content: `🔴 Turno finalizado para **${threadName}**\n⏱ ${horas}h ${minsRestantes}m`,
      ephemeral: true
    });
  }
});

client.login(TOKEN);
