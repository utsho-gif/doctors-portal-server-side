const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const { MongoClient, ServerApiVersion } = require('mongodb');
const app = express();
const port = process.env.PORT || 5000;

//middleware
app.use(cors());
app.use(express.json());


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.ler8u.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

//jwt verifier
function verifyJWT(req, res, next){
    const authHeader = req.headers.authorization;
    if(!authHeader){
        return res.status(401).send({message: 'Unuthorized Aceess'});
    }
    const token = authHeader.split(' ')[1];
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function(err, decoded){
        if(err){
            return res.status(403).send({message: 'Forbidden Access'});
        }
        req.decoded = decoded;
        next();
    })
}

async function run(){
    try{
        await client.connect();
        const serviceCollection = client.db('doctors_portal').collection('services');
        const bookingCollection = client.db('doctors_portal').collection('bookings');
        const userCollection = client.db('doctors_portal').collection('users');

        //get srvices
        app.get('/service', async(req,res) => {
            const query = {};
            const cursor = serviceCollection.find(query);
            const services = await cursor.toArray();
            res.send(services);
        })

        //get available date 
        app.get('/available', async(req,res) => {
            const date = req.query.date || 'May 22, 2022';

            //get all services
            const services = await serviceCollection.find().toArray();

            //find the bookings of that day
            const query = {date: date};
            const booking = await bookingCollection.find(query).toArray();

            //for each service find booking for that service
            services.forEach(service => {
                const serviceBookings = booking.filter(b => b.treatment === service.name);
                const booked = serviceBookings.map(s => s.slot);
                const available = service.slots.filter(s => !booked.includes(s));
                service.slots = available;
            })
            res.send(services);
        })


        //get individual booking details
        app.get('/booking',verifyJWT, async(req,res) => {
            const patient = req.query.patient;
            const decodedEmail = req.decoded.email;
            if(patient === decodedEmail){
                const query = {patient: patient};
                const booking = await bookingCollection.find(query).toArray();
                return res.send(booking);
            }
            else{
                return res.status(403).send({message: 'forbidden access'});
            }
           
        })

        //insert a data 
        app.post('/booking', async(req,res) => {
            const booking = req.body;
            const query = {treatment: booking.treatment, date: booking.date, patient: booking.patient}
            const exists = await bookingCollection.findOne(query);
            if(exists){
                return res.send({success: false, booking: exists})
            }
            const result = await bookingCollection.insertOne(booking);
            return res.send({success:true, result});
        })

        //get all user 
        app.get('/user',verifyJWT, async(req,res) => {
            const user = await userCollection.find().toArray();
            res.send(user);
        })

        //cheking admin or not
        app.get('/admin/:email',async(req,res) => {
            const email = req.params.email;
            const user = await userCollection.findOne({email: email});
            const isAdmin = user.role === 'admin';
            res.send({admin: isAdmin});
        })

        //make an admin
        app.put('/user/admin/:email',verifyJWT, async (req, res) => {
            const email = req.params.email;
            const requester = req.decoded.email;
            const requesterAccount = await userCollection.findOne({email: requester});
            if(requesterAccount.role === 'admin'){
                const filter = { email: email };
                const updateDoc = {
                 $set: {role: 'admin'},
                };
                const result = await userCollection.updateOne(filter, updateDoc);
                res.send(result);
            }
            else{
                return res.status(403).send({message: 'Forbidden Aceess'});
            }
            
          })

        //update a user 
        app.put('/user/:email', async (req, res) => {
            const email = req.params.email;
            const user = req.body;
            const filter = { email: email };
            const options = { upsert: true };
            const updateDoc = {
              $set: user,
            };
            const result = await userCollection.updateOne(filter, updateDoc, options);
            const token = jwt.sign({email: email}, process.env.ACCESS_TOKEN_SECRET,{
                expiresIn: '1h'
            })
            res.send({ result, token });
          })
    }
    finally{

    }

}

run().catch(console.dir);

app.get('/',(req, res) => {
    res.send('Home');
})

app.listen(port, () => {
    console.log('Listening', port);
})