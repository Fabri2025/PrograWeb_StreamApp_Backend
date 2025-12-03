import dotenv from 'dotenv';
import app from './server';

dotenv.config();

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => {
  console.log(`API regalos escuchando en puerto ${port}`);
});
